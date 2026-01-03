import express from 'express';
const router = express.Router();


import authMiddleware from '../middlewares/authMiddleware.js';
import roleCheck from '../middlewares/roleMiddleware.js';
import patientValidate from '../validates/patientValidate.js';
import validateIdParam from '../validates/idValidate.js';
import patientController from '../controllers/patientController.js';

router.use(authMiddleware);


router.post('/',roleCheck('reception'), patientValidate.validateCreatePatient,patientController.controllerCreatePatient);
router.get('/',roleCheck('reception'),patientController.controllerGetAllPatients);

// for search available patient in creating appointment
router.get('/search', roleCheck('reception'), patientController.controllerSearchPatients); 
router.get('/:patientId',roleCheck('reception'),validateIdParam('patientId'), patientController.controllerGetPatient);
router.put('/:patientId',roleCheck('reception'), validateIdParam('patientId'),patientValidate.validateUpdatePatient,patientController.controllerUpdatePatient);
router.delete('/:patientId',roleCheck('reception'), validateIdParam('patientId'),patientController.controllerDeletePatient);


router.get('/:patientId/appointments',roleCheck('reception'),validateIdParam('patientId'), patientController.controllerGetAllApptsPatient);
router.get('/:patientId/sessions',roleCheck('reception'),validateIdParam('patientId'), patientController.controllerGetAllSessionsPatient);
router.get('/:patientId/payments',roleCheck('reception'),validateIdParam('patientId'), patientController.controllerGetAllPaymentsPatient);
router.get('/:patientId/treatment-plans',roleCheck('reception'),validateIdParam('patientId'), patientController.controllerGetAllTreatmentPlansPatient);




export default router;