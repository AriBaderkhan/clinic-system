import sessionService from '../services/sessionService.js';
import asyncWrap from '../utils/asyncWrap.js';

const getAll = asyncWrap(async (req, res) => {
    const { day, q, page, limit } = req.query;
    const { tenant_id, branch_id } = req.user;
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(100, parseInt(limit) || 20);
    const { rows, total } = await sessionService.getAll({
        day, search: q, page: safePage, limit: safeLimit,
    }, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: rows, total, page: safePage, limit: safeLimit });
})

const getNormal = asyncWrap(async (req, res) => {
    const session_id = Number(req.params.sessionId);
    const { tenant_id, branch_id } = req.user;

    const result = await sessionService.getNormal(session_id, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const editNormal = asyncWrap(async (req, res) => {
    const session_id = Number(req.params.sessionId);
    const fields = req.body;
    const userId = req.user.id;
    const { tenant_id, branch_id } = req.user;

    const result = await sessionService.editNormal(session_id, fields, userId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const _delete = asyncWrap(async (req, res) => {
    const sessionID = Number(req.params.sessionId);
    const { id: deletedBy, tenant_id, branch_id } = req.user;

    const result = await sessionService.delete(sessionID, deletedBy, tenant_id, branch_id)
    res.status(200).json({ ok: true, data: result });
})

const getUnpaid = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const { limit, q, floor_id } = req.query;
    const safeLimit = limit ? Math.min(100, parseInt(limit) || 20) : undefined;
    const { sessions, total } = await sessionService.getUnpaid(tenant_id, branch_id, { limit: safeLimit, q, floor_id: floor_id ? Number(floor_id) : undefined });
    res.status(200).json({ ok: true, data: sessions, total });
})

const pay = asyncWrap(async (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const { normalAmount, planPayments, note, settleNormal, discountId } = req.body;
    const userId = req.user.id;   // who took the payment (was user_id → always empty)
    const { tenant_id, branch_id } = req.user;

    const result = await sessionService.pay({
        sessionId, normalAmount, planPayments, note, settleNormal, discountId, userId,
    }, tenant_id, branch_id);

    res.status(200).json({ ok: true, data: result });
})

const updatePlanTeeth = asyncWrap(async (req, res) => {
    const session_id = Number(req.params.sessionId);
    const { updates } = req.body;
    const { tenant_id, branch_id } = req.user;

    const result = await sessionService.updatePlanWorkTeeth(session_id, updates, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const editPayment = asyncWrap(async (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const paymentId = Number(req.params.paymentId);
    const { amount, note } = req.body;
    const { tenant_id, branch_id } = req.user;

    const result = await sessionService.editPayment(sessionId, paymentId, { amount, note }, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const deletePayment = asyncWrap(async (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const paymentId = Number(req.params.paymentId);
    const { tenant_id, branch_id } = req.user;

    const result = await sessionService.deletePayment(sessionId, paymentId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const editPlanPayment = asyncWrap(async (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const paymentId = Number(req.params.paymentId);
    const { amount, note } = req.body;
    const { tenant_id, branch_id } = req.user;

    const result = await sessionService.editPlanPayment(sessionId, paymentId, { amount, note }, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const deletePlanPayment = asyncWrap(async (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const paymentId = Number(req.params.paymentId);
    const { id: userId, tenant_id, branch_id } = req.user;

    const result = await sessionService.deletePlanPayment(sessionId, paymentId, userId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const deletePlanWork = asyncWrap(async (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const sessionWorkId = Number(req.params.sessionWorkId);
    const { id: userId, tenant_id, branch_id } = req.user;

    const result = await sessionService.deletePlanWork(sessionId, sessionWorkId, userId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const movePlanWork = asyncWrap(async (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const sessionWorkId = Number(req.params.sessionWorkId);
    const { treatment_plan_id } = req.body;
    const { id: userId, tenant_id, branch_id } = req.user;

    const result = await sessionService.movePlanWork(sessionId, sessionWorkId, treatment_plan_id, userId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

export default {
    getAll, getNormal, editNormal, delete: _delete, getUnpaid, pay, updatePlanTeeth,
    editPayment, deletePayment, editPlanPayment, deletePlanPayment, deletePlanWork, movePlanWork,
}