import scopeModel from '../models/scopeModel.js';
import appError from '../utils/appError.js';
import asyncWrap from '../utils/asyncWrap.js';
import { ownId } from '../utils/scope.js';

// When the user's tick is "own only", a record that is not theirs is answered
// as "not found" (same as a record that does not exist — nothing is revealed).
// Runs after permissionMiddleware, on every route that opens ONE record by id.
const onlyOwn = (permission, idFrom, isOwn, code, message) => asyncWrap(async (req, res, next) => {
    const userId = ownId(req.user, permission);
    if (!userId) return next();
    const recordId = Number(idFrom(req));
    if (!(recordId > 0)) return next(); // missing / bad id: the route's own validation answers
    const ok = await isOwn(recordId, userId, req.user.tenant_id, req.user.branch_id);
    if (!ok) throw appError(code, message, 404);
    next();
});

export default {
    patient: onlyOwn('view_patient', (req) => req.params.patientId ?? req.query.patientId, scopeModel.isOwnPatient, 'PATIENT_NOT_FOUND', 'Patient not found'),
    plan: onlyOwn('view_patient', (req) => req.params.treatmentPlanId, scopeModel.isOwnPlan, 'TREATMENT_PLAN_NOT_FOUND', 'Treatment plan not found'),
    appointment: onlyOwn('view_appointment', (req) => req.params.appointmentId, scopeModel.isOwnAppointment, 'APPOINTMENT_NOT_FOUND', 'Appointment not found'),
    session: onlyOwn('view_session', (req) => req.params.sessionId, scopeModel.isOwnSession, 'SESSION_NOT_FOUND', 'Session not found'),
};
