import sessionService from '../services/sessionService.js';
import asyncWrap from '../utils/asyncWrap.js';


const controllerGetAllSessions = asyncWrap(async (req, res) => {
    const { day, q } = req.query;
    const { tenant_id, branch_id } = req.user;

    const result = await sessionService.serviceGetAllSessions({
        day,
        search: q,
    }, tenant_id, branch_id)
    return res.status(200).json({ message: 'All Sessions are here', sessions: result });
})

const controllerGetNormalSession = asyncWrap(async (req, res) => {
    const session_id = Number(req.params.sessionId);
    const { tenant_id, branch_id } = req.user;

    const result = await sessionService.serviceGetNormalSession(session_id, tenant_id, branch_id);
    res.status(200).json({ message: 'Session Detail', data: result })
})
const controllerGetSession = asyncWrap(async (req, res) => {
    const session_id = Number(req.params.sessionId);
    const { tenant_id, branch_id } = req.user;

    const result = await sessionService.serviceGetSession(session_id, tenant_id, branch_id);
    return res.status(200).json({ message: `Session with id ${session_id} is here`, session: result });
})

const controllerEditNormalSession = asyncWrap(async (req, res) => {
    const session_id = Number(req.params.sessionId);
    const fields = req.body;
    const userId = req.user.id;
    const { tenant_id, branch_id } = req.user;

    const result = await sessionService.serviceEditNormalSession(session_id, fields, userId, tenant_id, branch_id);
    return res.status(200).json({ message: `Session with id ${session_id} updated successfully`, data: result });
})

const controllerDeleteSession = asyncWrap(async (req, res) => {
    const sessionID = Number(req.params.sessionId);
    const { tenant_id, branch_id } = req.user;

    const result = await sessionService.serviceDeleteSession(sessionID, tenant_id, branch_id)
    return res.status(204).json({ message: `Session with id ${sessionID} deleted successfully`, data: result });
})


const controllerGetAllUnPaidSessions = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await sessionService.serviceGetAllUnPaidSessions(tenant_id, branch_id)
    return res.status(200).json({ message: 'All Sessions are here', data: result });
})


const controllerPaySession = asyncWrap(async (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const { normalAmount, planPayments, note } = req.body;
    const userId = req.user?.user_id;
    const { tenant_id, branch_id } = req.user;

    const data = await sessionService.servicePaySession({
        sessionId,
        normalAmount,
        planPayments,
        note,
        userId,
    }, tenant_id, branch_id);

    return res.status(200).json({ message: "Payment saved", data: data });
})

export default {
    controllerGetAllSessions, controllerGetNormalSession, controllerGetSession, controllerEditNormalSession,
    controllerDeleteSession, controllerGetAllUnPaidSessions, controllerPaySession
}