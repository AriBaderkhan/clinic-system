import crypto from 'crypto';
import pool from '../db_connection.js';
import appError from '../utils/appError.js';
import storage from '../config/storage.js';
import subscriptionRequestModel from '../models/subscriptionRequestModel.js';
import subscriptionModel from '../models/subscriptionModel.js';
import planModel from '../models/planModel.js';
import subscriptionService, { SUBSCRIPTION_PERIOD_DAYS } from './subscriptionService.js';

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Tenant submits a renew/upgrade request with a payment-evidence image.
async function createRequest(tenant_id, plan_id, file) {
    const plan = await planModel.getPlanById(plan_id);
    if (!plan) throw appError('PLAN_NOT_FOUND', 'Plan not found', 404);

    const status = await subscriptionService.getMyStatus(tenant_id);
    if (!status.can_renew) {
        throw appError('RENEW_NOT_ALLOWED_YET', 'You can renew in the last 7 days of your plan or after it expires.', 400);
    }
    if (status.pending_request) {
        throw appError('REQUEST_ALREADY_PENDING', 'You already have a request awaiting confirmation.', 409);
    }
    if (!file) throw appError('EVIDENCE_REQUIRED', 'A payment-evidence image is required.', 400);

    // store the evidence image, then record the request
    const ext = EXT_BY_MIME[file.mimetype] || 'bin';
    const objectPath = `subscriptions/tenant_${tenant_id}/${crypto.randomUUID()}.${ext}`;
    try {
        await storage.uploadBuffer({ buffer: file.buffer, objectPath, contentType: file.mimetype });
    } catch {
        throw appError('EVIDENCE_UPLOAD_FAILED', 'Failed to upload the evidence image.', 502);
    }

    try {
        return await subscriptionRequestModel.createRequest({
            tenant_id, plan_id, amount: plan.price, evidence_path: objectPath,
        });
    } catch (err) {
        await storage.removeObject(objectPath).catch(() => {}); // don't orphan the file
        throw err;
    }
}

// Platform-admin queue: pending requests with a fresh signed evidence URL.
async function listPending() {
    const rows = await subscriptionRequestModel.listByStatus('pending');
    return Promise.all(
        rows.map(async (r) => ({
            ...r,
            evidence_url: r.evidence_path ? await storage.getSignedUrl(r.evidence_path) : null,
        }))
    );
}

// Approve → renew/upgrade the tenant's single subscription (+ mark request).
async function approve(requestId, reviewer_id) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const reqRow = await subscriptionRequestModel.getById(requestId, client);
        if (!reqRow) throw appError('REQUEST_NOT_FOUND', 'Request not found', 404);
        if (reqRow.status !== 'pending') throw appError('REQUEST_NOT_PENDING', 'This request was already reviewed.', 409);

        const subscription = await subscriptionModel.renewForTenant(
            reqRow.tenant_id, reqRow.plan_id, SUBSCRIPTION_PERIOD_DAYS, client
        );
        if (!subscription) throw appError('SUBSCRIPTION_NOT_FOUND', 'Tenant has no subscription to renew.', 404);

        const request = await subscriptionRequestModel.markReviewed(requestId, 'approved', reviewer_id, null, client);

        await client.query('COMMIT');
        return { request, subscription };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function reject(requestId, reviewer_id, note) {
    const reqRow = await subscriptionRequestModel.getById(requestId);
    if (!reqRow) throw appError('REQUEST_NOT_FOUND', 'Request not found', 404);
    if (reqRow.status !== 'pending') throw appError('REQUEST_NOT_PENDING', 'This request was already reviewed.', 409);
    return subscriptionRequestModel.markReviewed(requestId, 'rejected', reviewer_id, note);
}

export default { createRequest, listPending, approve, reject };
