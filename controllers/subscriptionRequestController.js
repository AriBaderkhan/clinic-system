import subscriptionRequestService from '../services/subscriptionRequestService.js';
import asyncWrap from '../utils/asyncWrap.js';

// Tenant: submit a renew/upgrade request with a payment-evidence image.
// (uploadImages middleware puts files on req.files; we take the first one.)
const create = asyncWrap(async (req, res) => {
    const { tenant_id } = req.user;
    const plan_id = Number(req.body.plan_id);
    const file = req.files?.[0] || null;
    const result = await subscriptionRequestService.createRequest(tenant_id, plan_id, file);
    res.status(201).json({ ok: true, data: result });
});

// Platform admin: list pending requests (with signed evidence URLs).
const listPending = asyncWrap(async (req, res) => {
    const result = await subscriptionRequestService.listPending();
    res.status(200).json({ ok: true, data: result });
});

// Platform admin: confirm a request → renews the tenant's subscription.
const approve = asyncWrap(async (req, res) => {
    const result = await subscriptionRequestService.approve(Number(req.params.requestId), req.user.id);
    res.status(200).json({ ok: true, data: result });
});

// Platform admin: reject a request (optional note).
const reject = asyncWrap(async (req, res) => {
    const result = await subscriptionRequestService.reject(Number(req.params.requestId), req.user.id, req.body?.note);
    res.status(200).json({ ok: true, data: result });
});

export default { create, listPending, approve, reject };
