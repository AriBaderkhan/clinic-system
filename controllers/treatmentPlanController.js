import treatmentPlanService from '../services/treatmentPlanService.js';
import asyncWrap from '../utils/asyncWrap.js';

const getActive = asyncWrap(async (req, res) => {
    const patientId = Number(req.query.patientId);
    const type = req.query.type;

    if (!patientId || !type) {
        return res.status(400).json({ ok: false, error: 'VALIDATION_ERROR', message: 'patientId and type are required' });
    }
    const result = await treatmentPlanService.getActive(patientId, type, req.user.tenant_id, req.user.branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getSessions = asyncWrap(async (req, res) => {
    const tpId = Number(req.params.treatmentPlanId)
    const { tenant_id, branch_id } = req.user;

    const result = await treatmentPlanService.getSessions(tpId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getAll = asyncWrap(async (req, res) => {
    const { isPaid, isCompleted, q, page, limit } = req.query;

    const parseBool = (v) => {
        if (v === undefined || v === null || v === "") return undefined;
        if (v === "true") return true;
        if (v === "false") return false;
        return undefined;
    };

    const { tenant_id, branch_id } = req.user;
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(100, parseInt(limit) || 20);
    const { rows, total } = await treatmentPlanService.getAll({
        isPaid: parseBool(isPaid),
        isCompleted: parseBool(isCompleted),
        search: q,
        page: safePage,
        limit: safeLimit,
    }, tenant_id, branch_id);

    res.status(200).json({ ok: true, data: rows, total, page: safePage, limit: safeLimit });
})

const update = asyncWrap(async (req, res) => {
    const { type, agreed_total, is_completed } = req.body;
    const tpId = Number(req.params.treatmentPlanId)
    const { tenant_id, branch_id } = req.user;

    const result = await treatmentPlanService.update(type, agreed_total, is_completed, tpId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const _delete = asyncWrap(async (req, res) => {
    const tpId = Number(req.params.treatmentPlanId)
    const { id: deletedBy, tenant_id, branch_id } = req.user;

    await treatmentPlanService.delete(tpId, deletedBy, tenant_id, branch_id)
    res.status(200).json({ ok: true });
})

const updatePaidSession = asyncWrap(async (req, res) => {
    const tpId = Number(req.params.treatmentPlanId);
    const sessionId = Number(req.params.sessionId);
    const { amount } = req.body;
    const { tenant_id, branch_id } = req.user;

    const result = await treatmentPlanService.updatePaidSession(tpId, sessionId, amount, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
});

export default {
    getActive, getSessions, getAll,
    update, delete: _delete, updatePaidSession
}