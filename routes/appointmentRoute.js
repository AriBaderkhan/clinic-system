import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import roleCheck from '../middlewares/roleMiddleware.js';
import appointmentValidate from '../validates/appointmentValidate.js';  
import appointmentController from '../controllers/appoinmentController.js';
import validateIdParam from '../validates/idValidate.js';  

router.use(authMiddleware)

router.post('/', roleCheck('reception'), appointmentValidate.validateCreateAppointment, appointmentController.controllerCreateAppointment);
// router.get('/', roleCheck('reception'), appointmentController.controllerGetAllAppointments);
router.get("/", roleCheck('reception'), appointmentValidate.validateListApptsFilters, appointmentController.controllerListAppointments);
router.get("/active/today", roleCheck('reception'), appointmentController.controllerActiveTodayAppt);
router.get('/:appointmentId', roleCheck('reception','doctor','super_doctor'),validateIdParam('appointmentId'), appointmentController.controllerGetAppointment);
router.put('/:appointmentId', roleCheck('reception'),validateIdParam('appointmentId'), appointmentValidate.validateUpdateAppointment, appointmentController.controllerUpdateAppointment);
router.delete('/:appointmentId', roleCheck('reception'),validateIdParam('appointmentId'), appointmentController.controllerDeleteAppointment);

// status actions
router.patch('/:appointmentId/checked-in', roleCheck('reception','doctor','super_doctor'), validateIdParam('appointmentId'), appointmentController.controllerSetCheckedIn);
router.patch('/:appointmentId/in_progress', roleCheck('reception','doctor','super_doctor'), validateIdParam('appointmentId'), appointmentController.controllerSetStart);
router.post('/:appointmentId/completed', roleCheck('reception','doctor','super_doctor'), validateIdParam('appointmentId'), appointmentValidate.validateCompleteFillWork, appointmentController.controllerSetComplete);
router.patch('/:appointmentId/cancelled', roleCheck('reception','super_doctor'),validateIdParam('appointmentId'), appointmentValidate.validateCancelReason,appointmentController.controllerSetCancel);
router.patch('/:appointmentId/no_show', roleCheck('reception'),validateIdParam('appointmentId'), appointmentValidate.validateCancelReason,appointmentController.controllerSetNoShow);


router.get('/:appointmentId/session', roleCheck('reception','doctor','super_doctor'), validateIdParam('appointmentId'), appointmentController.controllerGetSessionByApptId);
export default router;