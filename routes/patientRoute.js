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

router.post('/', permissionMiddleware('create_patient'), patientValidate.create, patientController.create);
router.get('/', permissionMiddleware('view_patient'), patientController.getAll);
router.get('/search', permissionMiddleware('view_patient'), patientController.search);
router.get('/:patientId', permissionMiddleware('view_patient'), validateIdParam('patientId'), patientController.getById);
router.put('/:patientId', permissionMiddleware('update_patient'), validateIdParam('patientId'), patientValidate.update, patientController.update);
router.delete('/:patientId', permissionMiddleware('delete_patient'), validateIdParam('patientId'), patientController.delete);

router.get('/:patientId/appointments', permissionMiddleware('view_appointment'), validateIdParam('patientId'), patientController.getAppointments);
router.get('/:patientId/sessions', permissionMiddleware('view_session'), validateIdParam('patientId'), patientController.getSessions);
router.get('/:patientId/payments', permissionMiddleware('view_payment'), validateIdParam('patientId'), patientController.getPayments);
router.get('/:patientId/treatment-plans', permissionMiddleware('manage_tp'), validateIdParam('patientId'), patientController.getTreatmentPlans);

export default router;