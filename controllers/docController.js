import docService from '../services/docService.js';
import asyncWrap from '../utils/asyncWrap.js';

const getAll = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await docService.getAll(tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getActiveToday = asyncWrap(async (req, res) => {
    const doc_id = req.user.id;
    const { tenant_id, branch_id } = req.user;

    const result = await docService.getActiveToday(doc_id, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getAppointments = asyncWrap(async (req, res) => {
    const { day, type, q } = req.query;
    const doc_id = req.user.id
    const { tenant_id, branch_id } = req.user;

    const result = await docService.getAppointments({
        day, type, search: q, doc_id
    }, tenant_id, branch_id);

    res.status(200).json({ ok: true, data: result });
})

const getSession = asyncWrap(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId)
    const doc_id = req.user.id
    const { tenant_id, branch_id } = req.user;

    const result = await docService.getSession(appointmentId, doc_id, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

export default { getAll, getActiveToday, getAppointments, getSession }