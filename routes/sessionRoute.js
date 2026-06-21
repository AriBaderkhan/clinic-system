import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import validateIdParam from '../validates/idValidate.js';
import sessionValidate from '../validates/sessionValidate.js';
import sessionController from '../controllers/sessionController.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';
import sessionImageController from '../controllers/sessionImageController.js';
import { uploadImages } from '../middlewares/uploadMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

router.get('/', permissionMiddleware('view_session'), sessionValidate.filters, sessionController.getAll);
router.get('/unpaid', permissionMiddleware('view_session'), sessionController.getUnpaid);
router.get('/:sessionId/normal', permissionMiddleware('view_session'), validateIdParam('sessionId'), sessionController.getNormal);
router.put('/:sessionId/normal', permissionMiddleware('edit_session'), validateIdParam('sessionId'), sessionValidate.edit, sessionController.editNormal);
router.patch('/:sessionId/plan-works/tooth', permissionMiddleware('edit_session', 'finalize_session'), validateIdParam('sessionId'), sessionController.updatePlanTeeth);
router.delete('/:sessionId', permissionMiddleware('delete_session'), validateIdParam('sessionId'), sessionController.delete);
router.post('/:sessionId/pay', permissionMiddleware('collect_payment'), validateIdParam('sessionId'), sessionController.pay);

// ── Case images for a session ──────────────────────────────────────────────
router.post('/:sessionId/images', permissionMiddleware('finalize_session', 'edit_session'), validateIdParam('sessionId'), uploadImages, sessionImageController.upload);
router.get('/:sessionId/images', permissionMiddleware('view_session'), validateIdParam('sessionId'), sessionImageController.list);
router.delete('/:sessionId/images/:imageId', permissionMiddleware('edit_session', 'delete_session'), validateIdParam('sessionId'), validateIdParam('imageId'), sessionImageController.remove);

export default router;