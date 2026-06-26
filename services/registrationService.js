import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../db_connection.js';
import appError from '../utils/appError.js';
import storage from '../config/storage.js';
import registrationModel from '../models/registrationModel.js';
import planModel from '../models/planModel.js';
import adminPlatformModel from '../models/adminPlatformModel.js';
import verificationService from './verificationService.js';
import emailService from './emailService.js';

const REG_PURPOSE = 'register';
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Step 1: send the email verification code.
async function sendCode(email) {
    return verificationService.requestCode(email, REG_PURPOSE);
}

// Step 2: confirm the code.
async function verifyCode(email, code) {
    return verificationService.confirmCode(email, code, REG_PURPOSE);
}

// Step 3: create the pending registration (email must be verified first).
async function createRequest(data, file) {
    const { tenant_name, manager_name, email, phone, address, password, plan_id } = data;

    const plan = await planModel.getPlanById(plan_id);
    if (!plan) throw appError('PLAN_NOT_FOUND', 'Plan not found', 404);

    const verification = await verificationService.assertVerified(email, REG_PURPOSE);

    if (await registrationModel.userEmailExists(email)) {
        throw appError('EMAIL_TAKEN', 'This email is already registered.', 409);
    }
    if (await registrationModel.findPendingByEmail(email)) {
        throw appError('REQUEST_ALREADY_PENDING', 'You already have a pending registration with this email.', 409);
    }
    if (!file) throw appError('EVIDENCE_REQUIRED', 'A payment-evidence image is required.', 400);

    const password_hash = await bcrypt.hash(password, 10);

    // store the evidence image, then record the request
    const ext = EXT_BY_MIME[file.mimetype] || 'bin';
    const objectPath = `registrations/${crypto.randomUUID()}.${ext}`;
    try {
        await storage.uploadBuffer({ buffer: file.buffer, objectPath, contentType: file.mimetype });
    } catch {
        throw appError('EVIDENCE_UPLOAD_FAILED', 'Failed to upload the evidence image.', 502);
    }

    let request;
    try {
        request = await registrationModel.createRequest({
            tenant_name, manager_name, email, phone, address,
            password_hash, plan_id, evidence_path: objectPath,
        });
    } catch (err) {
        await storage.removeObject(objectPath).catch(() => {}); // don't orphan the file
        throw err;
    }

    await verificationService.consume(verification.id);

    const { password_hash: _omit, ...safe } = request; // never return the hash
    return safe;
}

// Platform admin: pending queue with a fresh signed evidence URL.
async function listPending() {
    const rows = await registrationModel.listByStatus('pending');
    return Promise.all(
        rows.map(async (r) => ({
            ...r,
            evidence_url: r.evidence_path ? await storage.getSignedUrl(r.evidence_path) : null,
        }))
    );
}

// Approve → provision the tenant (reusing the adminPlatform flow) + email the owner.
async function approve(requestId, reviewer_id) {
    const client = await pool.connect();
    let reqRow;
    try {
        await client.query('BEGIN');

        reqRow = await registrationModel.getById(requestId, client);
        if (!reqRow) throw appError('REQUEST_NOT_FOUND', 'Request not found', 404);
        if (reqRow.status !== 'pending') throw appError('REQUEST_NOT_PENDING', 'This request was already reviewed.', 409);

        const tenant = await adminPlatformModel.createTenant(client, reqRow.tenant_name, null);
        await adminPlatformModel.createTenantSettings(client, tenant.id, 'UTC', 'USD');

        // password is already hashed (stored at signup) — insert as-is.
        const user = await adminPlatformModel.createUser(client, reqRow.email, reqRow.password_hash, tenant.id);
        await adminPlatformModel.createProfile(client, user.id, reqRow.manager_name, reqRow.phone || '', reqRow.address || '');

        const role = await adminPlatformModel.findRoleIdByName('tenant_manager');
        if (!role) throw appError('ROLE_MISSING', 'tenant_manager role not found', 500);
        await adminPlatformModel.assignRole(client, user.id, role.id, tenant.id, null); // null branch is fine for tenant_manager

        await adminPlatformModel.createSubscription(client, tenant.id, reqRow.plan_id);

        await registrationModel.markReviewed(requestId, 'approved', reviewer_id, null, client);

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    // After commit: send the welcome email. Don't fail the approval if mail fails.
    emailService.sendRegistrationApproved(reqRow.email, reqRow.manager_name).catch(() => {});

    return { message: 'Tenant approved and provisioned', email: reqRow.email };
}

async function reject(requestId, reviewer_id, note) {
    const reqRow = await registrationModel.getById(requestId);
    if (!reqRow) throw appError('REQUEST_NOT_FOUND', 'Request not found', 404);
    if (reqRow.status !== 'pending') throw appError('REQUEST_NOT_PENDING', 'This request was already reviewed.', 409);
    return registrationModel.markReviewed(requestId, 'rejected', reviewer_id, note);
}

export default { sendCode, verifyCode, createRequest, listPending, approve, reject };
