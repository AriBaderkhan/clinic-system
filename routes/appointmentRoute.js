import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import appointmentValidate from '../validates/appointmentValidate.js';
import appointmentController from '../controllers/appoinmentController.js';
import validateIdParam from '../validates/idValidate.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware)
router.use(branchAssigmentMiddleware)

router.post('/', permissionMiddleware('create_appointment'), appointmentValidate.validateCreateAppointment, appointmentController.controllerCreateAppointment);
// router.get('/', roleCheck('reception'), appointmentController.controllerGetAllAppointments);
router.get("/", permissionMiddleware('view_appointment'), appointmentValidate.validateListApptsFilters, appointmentController.controllerListAppointments);
router.get("/active/today", permissionMiddleware('view_appointment'), appointmentController.controllerActiveTodayAppt);
router.get('/:appointmentId', permissionMiddleware('view_appointment'), validateIdParam('appointmentId'), appointmentController.controllerGetAppointment);
router.put('/:appointmentId', permissionMiddleware('update_appointment'), validateIdParam('appointmentId'), appointmentValidate.validateUpdateAppointment, appointmentController.controllerUpdateAppointment);
// router.delete('/:appointmentId', permissionMiddleware('reception'), validateIdParam('appointmentId'), appointmentController.controllerDeleteAppointment);

// status actions
router.patch('/:appointmentId/checked-in', permissionMiddleware('update_appointment_status'), validateIdParam('appointmentId'), appointmentController.controllerSetCheckedIn);
router.patch('/:appointmentId/in_progress', permissionMiddleware('update_appointment_status'), validateIdParam('appointmentId'), appointmentController.controllerSetStart);
router.post('/:appointmentId/completed', permissionMiddleware('finalize_session'), validateIdParam('appointmentId'), appointmentValidate.validateCompleteFillWork, appointmentController.controllerSetComplete);
router.patch('/:appointmentId/cancelled', permissionMiddleware('update_appointment_status'), validateIdParam('appointmentId'), appointmentValidate.validateCancelReason, appointmentController.controllerSetCancel);
router.patch('/:appointmentId/no_show', permissionMiddleware('update_appointment_status'), validateIdParam('appointmentId'), appointmentValidate.validateCancelReason, appointmentController.controllerSetNoShow);


router.get('/:appointmentId/session', permissionMiddleware('view_session'), validateIdParam('appointmentId'), appointmentController.controllerGetSessionByApptId);
export default router;