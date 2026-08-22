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

    await sessionService.delete(sessionID, deletedBy, tenant_id, branch_id)
    res.status(200).json({ ok: true });
})

const getUnpaid = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const { limit, q } = req.query;
    const safeLimit = limit ? Math.min(100, parseInt(limit) || 20) : undefined;
    const { sessions, total } = await sessionService.getUnpaid(tenant_id, branch_id, { limit: safeLimit, q });
    res.status(200).json({ ok: true, data: sessions, total });
})

const pay = asyncWrap(async (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const { normalAmount, planPayments, note, settleNormal, discountId } = req.body;
    const userId = req.user?.user_id;
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

export default {
    getAll, getNormal, editNormal, delete: _delete, getUnpaid, pay, updatePlanTeeth
}