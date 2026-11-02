import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import scopeMiddleware from "../middlewares/scopeMiddleware.js";
import appointmentValidate from '../validates/appointmentValidate.js';
import appointmentController from '../controllers/appointmentController.js';
import validateIdParam from '../validates/idValidate.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware)
router.use(branchAssigmentMiddleware)

router.post('/', permissionMiddleware('create_appointment'), appointmentValidate.create, appointmentController.create);
router.get("/", permissionMiddleware('view_appointment'), appointmentValidate.filters, appointmentController.getAll);
router.get("/active/today", permissionMiddleware('view_appointment'), appointmentValidate.floorFilter, appointmentController.getActiveToday);
router.get("/calendar", permissionMiddleware('view_appointment'), appointmentValidate.floorFilter, appointmentController.getCalendar);
router.get('/:appointmentId', permissionMiddleware('view_appointment'), validateIdParam('appointmentId'), scopeMiddleware.appointment, appointmentController.getById);
router.put('/:appointmentId', permissionMiddleware('update_appointment'), validateIdParam('appointmentId'), appointmentValidate.update, scopeMiddleware.appointment, appointmentController.update);
router.delete('/:appointmentId', permissionMiddleware('delete_appointment'), validateIdParam('appointmentId'), scopeMiddleware.appointment, appointmentController.delete);

router.patch('/:appointmentId/checked-in', permissionMiddleware('update_appointment_status'), validateIdParam('appointmentId'), scopeMiddleware.appointment, appointmentController.checkIn);
// Doctors (finalize_session) OR reception/branch (update_appointment_status) can
// start a visit. The service still only allows checked_in -> in_progress.
router.patch('/:appointmentId/in_progress', permissionMiddleware('update_appointment_status', 'finalize_session'), validateIdParam('appointmentId'), scopeMiddleware.appointment, appointmentController.start);
router.post('/:appointmentId/completed', permissionMiddleware('finalize_session'), validateIdParam('appointmentId'), appointmentValidate.complete, scopeMiddleware.appointment, appointmentController.complete);
// Save the mid-visit draft (complaint + notes + next plan). Doctors (finalize_session)
// and reception/branch (update_appointment_status) can both save — OR semantics.
router.patch('/:appointmentId/visit-draft', permissionMiddleware('finalize_session', 'update_appointment_status'), validateIdParam('appointmentId'), appointmentValidate.visitDraft, scopeMiddleware.appointment, appointmentController.saveVisitDraft);
router.patch('/:appointmentId/cancelled', permissionMiddleware('update_appointment_status'), validateIdParam('appointmentId'), appointmentValidate.cancel, scopeMiddleware.appointment, appointmentController.cancel);
router.patch('/:appointmentId/no_show', permissionMiddleware('update_appointment_status'), validateIdParam('appointmentId'), appointmentValidate.cancel, scopeMiddleware.appointment, appointmentController.noShow);

router.get('/:appointmentId/session', permissionMiddleware('view_session'), validateIdParam('appointmentId'), scopeMiddleware.appointment, appointmentController.getSession);

export default router;
