import express from 'express';
const router = express.Router();


import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import patientValidate from '../validates/patientValidate.js';
import validateIdParam from '../validates/idValidate.js';
import patientController from '../controllers/patientController.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);


router.post('/', permissionMiddleware('create_patient'), patientValidate.validateCreatePatient, patientController.controllerCreatePatient);
router.get('/', permissionMiddleware('view_patient'), patientController.controllerGetAllPatients);

// for search available patient in creating appointment
router.get('/search', permissionMiddleware('view_patient'), patientController.controllerSearchPatients);
router.get('/:patientId', permissionMiddleware('view_patient'), validateIdParam('patientId'), patientController.controllerGetPatient);
router.put('/:patientId', permissionMiddleware('update_patient'), validateIdParam('patientId'), patientValidate.validateUpdatePatient, patientController.controllerUpdatePatient);
// router.delete('/:patientId', permissionMiddleware('manage_patients'), validateIdParam('patientId'), patientController.controllerDeletePatient);


router.get('/:patientId/appointments', permissionMiddleware('view_appointment'), validateIdParam('patientId'), patientController.controllerGetAllApptsPatient);
router.get('/:patientId/sessions', permissionMiddleware('view_session'), validateIdParam('patientId'), patientController.controllerGetAllSessionsPatient);
router.get('/:patientId/payments', permissionMiddleware('view_payment'), validateIdParam('patientId'), patientController.controllerGetAllPaymentsPatient);
router.get('/:patientId/treatment-plans', permissionMiddleware('manage_tp'), validateIdParam('patientId'), patientController.controllerGetAllTreatmentPlansPatient);


export default router;