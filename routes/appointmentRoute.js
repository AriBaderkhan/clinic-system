import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import appointmentValidate from '../validates/appointmentValidate.js';
import appointmentController from '../controllers/appointmentController.js';
import validateIdParam from '../validates/idValidate.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware)
router.use(branchAssigmentMiddleware)

router.post('/', permissionMiddleware('create_appointment'), appointmentValidate.create, appointmentController.create);
router.get("/", permissionMiddleware('view_appointment'), appointmentValidate.filters, appointmentController.getAll);
router.get("/active/today", permissionMiddleware('view_appointment'), appointmentController.getActiveToday);
router.get("/calendar", permissionMiddleware('view_appointment'), appointmentController.getCalendar);
router.get('/:appointmentId', permissionMiddleware('view_appointment'), validateIdParam('appointmentId'), appointmentController.getById);
router.put('/:appointmentId', permissionMiddleware('update_appointment'), validateIdParam('appointmentId'), appointmentValidate.update, appointmentController.update);
router.delete('/:appointmentId', permissionMiddleware('delete_appointment'), validateIdParam('appointmentId'), appointmentController.delete);

router.patch('/:appointmentId/checked-in', permissionMiddleware('update_appointment_status'), validateIdParam('appointmentId'), appointmentController.checkIn);
// Doctors (finalize_session) OR reception/branch (update_appointment_status) can
// start a visit. The service still only allows checked_in -> in_progress.
router.patch('/:appointmentId/in_progress', permissionMiddleware('update_appointment_status', 'finalize_session'), validateIdParam('appointmentId'), appointmentController.start);
router.post('/:appointmentId/completed', permissionMiddleware('finalize_session'), validateIdParam('appointmentId'), appointmentValidate.complete, appointmentController.complete);
// Save the mid-visit draft (complaint + notes + next plan). Doctors (finalize_session)
// and reception/branch (update_appointment_status) can both save — OR semantics.
router.patch('/:appointmentId/visit-draft', permissionMiddleware('finalize_session', 'update_appointment_status'), validateIdParam('appointmentId'), appointmentValidate.visitDraft, appointmentController.saveVisitDraft);
router.patch('/:appointmentId/cancelled', permissionMiddleware('update_appointment_status'), validateIdParam('appointmentId'), appointmentValidate.cancel, appointmentController.cancel);
router.patch('/:appointmentId/no_show', permissionMiddleware('update_appointment_status'), validateIdParam('appointmentId'), appointmentValidate.cancel, appointmentController.noShow);

router.get('/:appointmentId/session', permissionMiddleware('view_session'), validateIdParam('appointmentId'), appointmentController.getSession);

export default router;
