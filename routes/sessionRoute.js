import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import validateIdParam from '../validates/idValidate.js';
import sessionValidate from '../validates/sessionValidate.js';
import sessionController from '../controllers/sessionController.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

router.get('/', permissionMiddleware('view_session'), sessionValidate.filters, sessionController.getAll);
router.get('/unpaid', permissionMiddleware('view_session'), sessionController.getUnpaid);
router.get('/:sessionId/normal', permissionMiddleware('view_session'), validateIdParam('sessionId'), sessionController.getNormal);
router.put('/:sessionId/normal', permissionMiddleware('edit_session'), validateIdParam('sessionId'), sessionValidate.edit, sessionController.editNormal);
router.delete('/:sessionId', permissionMiddleware('delete_session'), validateIdParam('sessionId'), sessionController.delete);
router.post('/:sessionId/pay', permissionMiddleware('collect_payment'), validateIdParam('sessionId'), sessionController.pay);

export default router;