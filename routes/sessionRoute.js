import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import scopeMiddleware from "../middlewares/scopeMiddleware.js";
import validateIdParam from '../validates/idValidate.js';
import sessionValidate from '../validates/sessionValidate.js';
import sessionController from '../controllers/sessionController.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';
import sessionImageController from '../controllers/sessionImageController.js';
import { uploadImages } from '../middlewares/uploadMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

router.get('/', permissionMiddleware('view_session'), sessionValidate.filters, sessionController.getAll);
router.get('/unpaid', permissionMiddleware('view_session'), sessionValidate.unpaidFilters, sessionController.getUnpaid);
router.get('/:sessionId/normal', permissionMiddleware('view_session'), validateIdParam('sessionId'), scopeMiddleware.session, sessionController.getNormal);
router.put('/:sessionId/normal', permissionMiddleware('edit_session'), validateIdParam('sessionId'), sessionValidate.edit, scopeMiddleware.session, sessionController.editNormal);
router.patch('/:sessionId/plan-works/tooth', permissionMiddleware('edit_session', 'finalize_session'), validateIdParam('sessionId'), scopeMiddleware.session, sessionController.updatePlanTeeth);
router.delete('/:sessionId', permissionMiddleware('delete_session'), validateIdParam('sessionId'), scopeMiddleware.session, sessionController.delete);
router.post('/:sessionId/pay', permissionMiddleware('collect_payment'), validateIdParam('sessionId'), sessionValidate.pay, scopeMiddleware.session, sessionController.pay);

// ── Correcting a visit: one payment / one plan work at a time ───────────────
router.patch('/:sessionId/payments/:paymentId', permissionMiddleware('edit_payment'), validateIdParam('sessionId'), validateIdParam('paymentId'), sessionValidate.paymentEdit, scopeMiddleware.session, sessionController.editPayment);
router.delete('/:sessionId/payments/:paymentId', permissionMiddleware('edit_payment'), validateIdParam('sessionId'), validateIdParam('paymentId'), scopeMiddleware.session, sessionController.deletePayment);
router.patch('/:sessionId/plan-payments/:paymentId', permissionMiddleware('edit_payment'), validateIdParam('sessionId'), validateIdParam('paymentId'), sessionValidate.paymentEdit, scopeMiddleware.session, sessionController.editPlanPayment);
router.delete('/:sessionId/plan-payments/:paymentId', permissionMiddleware('edit_payment'), validateIdParam('sessionId'), validateIdParam('paymentId'), scopeMiddleware.session, sessionController.deletePlanPayment);
router.delete('/:sessionId/plan-works/:sessionWorkId', permissionMiddleware('edit_session'), validateIdParam('sessionId'), validateIdParam('sessionWorkId'), scopeMiddleware.session, sessionController.deletePlanWork);
router.patch('/:sessionId/plan-works/:sessionWorkId/plan', permissionMiddleware('edit_session'), validateIdParam('sessionId'), validateIdParam('sessionWorkId'), sessionValidate.movePlanWork, scopeMiddleware.session, sessionController.movePlanWork);

// ── Case images for a session ──────────────────────────────────────────────
router.post('/:sessionId/images', permissionMiddleware('finalize_session', 'edit_session'), validateIdParam('sessionId'), scopeMiddleware.session, uploadImages, sessionImageController.upload);
router.get('/:sessionId/images', permissionMiddleware('view_session'), validateIdParam('sessionId'), scopeMiddleware.session, sessionImageController.list);
router.delete('/:sessionId/images/:imageId', permissionMiddleware('edit_session', 'delete_session'), validateIdParam('sessionId'), validateIdParam('imageId'), scopeMiddleware.session, sessionImageController.remove);

export default router;