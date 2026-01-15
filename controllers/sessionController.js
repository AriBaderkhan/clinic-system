import sessionService from '../services/sessionService.js';
import asyncWrap from '../utils/asyncWrap.js';


const controllerCreateSession = asyncWrap(async (req, res) => {
    const { complaint, diagnosis, next_plan, notes } = req.body;
    const appointment_id = parseInt(req.params.appointmentId);
    const created_by = req.user.id;
    const sessionData = { appointment_id, complaint, diagnosis, next_plan, notes, created_by };

    const result = await sessionService.serviceCreateSession(sessionData);
    return res.status(201).json({ message: `Session created successfully`, session: result });
})

const controllerGetAllSessions = asyncWrap(async (req, res) => {
    const { day, q } = req.query;

    const result = await sessionService.serviceGetAllSessions({
        day,
        search: q,
    })
    return res.status(200).json({ message: 'All Sessions are here', sessions: result });
})

const controllerGetNormalSession = asyncWrap(async (req, res) => {
    const session_id = Number(req.params.sessionId);

    const result = await sessionService.serviceGetNormalSession(session_id);
    res.status(200).json({ message: 'Session Detail', data: result })
})
const controllerGetSession = asyncWrap(async (req, res) => {
    const session_id = Number(req.params.sessionId);

    const result = await sessionService.serviceGetSession(session_id);
    return res.status(200).json({ message: `Session with id ${session_id} is here`, session: result });
})

const controllerEditNormalSession = asyncWrap(async (req, res) => {
    const session_id = Number(req.params.sessionId);
    const fields = req.body;

    const result = await sessionService.serviceEditNormalSession(session_id, fields);
    return res.status(200).json({ message: `Session with id ${session_id} updated successfully`, data: result });
})

const controllerDeleteSession = asyncWrap(async (req, res) => {
    const sessionID = Number(req.params.sessionId);

    const result = await sessionService.serviceDeleteSession(sessionID)
    return res.status(204).json({ message: `Session with id ${sessionID} deleted successfully`, data: result });
})


const controllerGetAllUnPaidSessions = asyncWrap(async (req, res) => {

    const result = await sessionService.serviceGetAllUnPaidSessions()
    return res.status(200).json({ message: 'All Sessions are here', data: result });
})


const controllerPaySession = asyncWrap(async (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const { normalAmount, planPayments, note } = req.body;
    const userId = req.user?.user_id;

    const data = await sessionService.servicePaySession({
        sessionId,
        normalAmount,
        planPayments,
        note,
        userId,
    });

    return res.status(200).json({ message: "Payment saved", data: data });
})

export default {
    controllerCreateSession, controllerGetAllSessions,controllerGetNormalSession, controllerGetSession, controllerEditNormalSession, 
    controllerDeleteSession, controllerGetAllUnPaidSessions, controllerPaySession
}