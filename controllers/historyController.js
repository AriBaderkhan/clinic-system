import historyService from '../services/historyService.js';
import asyncWrap from '../utils/asyncWrap.js';

const getPayments = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await historyService.getPayments(tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getSessionDetails = asyncWrap(async (req, res) => {
    const session_id = Number(req.params.sessionId);
    const { tenant_id, branch_id } = req.user;

    const result = await historyService.getSessionDetails(session_id, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

export default { getPayments, getSessionDetails }