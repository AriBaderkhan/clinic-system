import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import scopeMiddleware from "../middlewares/scopeMiddleware.js";
import patientValidate from '../validates/patientValidate.js';
import validateIdParam from '../validates/idValidate.js';
import patientController from '../controllers/patientController.js';
import patientShareValidate from '../validates/patientShareValidate.js';
import patientShareController from '../controllers/patientShareController.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

router.post('/', permissionMiddleware('create_patient'), patientValidate.create, patientController.create);
router.get('/', permissionMiddleware('view_patient'), patientController.getAll);
router.get('/search', permissionMiddleware('view_patient'), patientController.search);
// before adding a patient: is this phone already a patient in another branch? (branch names only)
router.get('/phone-check', permissionMiddleware('create_patient'), patientShareValidate.phone, patientShareController.phoneCheck);
router.get('/referral-sources', permissionMiddleware('view_patient'), patientController.getReferralSources);
router.get('/:patientId', permissionMiddleware('view_patient'), validateIdParam('patientId'), scopeMiddleware.patient, patientController.getById);
router.put('/:patientId', permissionMiddleware('update_patient'), validateIdParam('patientId'), patientValidate.update, scopeMiddleware.patient, patientController.update);
router.delete('/:patientId', permissionMiddleware('delete_patient'), validateIdParam('patientId'), scopeMiddleware.patient, patientController.delete);

router.get('/:patientId/appointments', permissionMiddleware('view_appointment'), validateIdParam('patientId'), scopeMiddleware.patient, patientController.getAppointments);
router.get('/:patientId/sessions', permissionMiddleware('view_session'), validateIdParam('patientId'), scopeMiddleware.patient, patientController.getSessions);
router.get('/:patientId/payments', permissionMiddleware('view_payment'), validateIdParam('patientId'), scopeMiddleware.patient, patientController.getPayments);
router.get('/:patientId/treatment-plans', permissionMiddleware('manage_tp'), validateIdParam('patientId'), scopeMiddleware.patient, patientController.getTreatmentPlans);

// sharing with other branches of the clinic (home branch only — checked in the service)
router.get('/:patientId/shares', permissionMiddleware('view_patient'), validateIdParam('patientId'), scopeMiddleware.patient, patientShareController.getShares);
router.post('/:patientId/shares', permissionMiddleware('share_patient'), validateIdParam('patientId'), patientShareValidate.share, scopeMiddleware.patient, patientShareController.share);
router.delete('/:patientId/shares/:branchId', permissionMiddleware('share_patient'), validateIdParam('patientId'), validateIdParam('branchId'), scopeMiddleware.patient, patientShareController.unshare);

export default router;