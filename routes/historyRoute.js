import express from 'express'
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import historyController from '../controllers/historyController.js';
import validateIdParam from '../validates/idValidate.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware)
router.use(branchAssigmentMiddleware)

router.get('/payments', permissionMiddleware('view_payment'), historyController.getPayments)
router.get('/session/:sessionId/details', permissionMiddleware('view_session'), validateIdParam('sessionId'), historyController.getSessionDetails)

export default router;