import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import idValidate from '../validates/idValidate.js';
import subscriptionValidate from '../validates/subscriptionValidate.js';
import subscriptionController from '../controllers/subscriptionController.js';
import subscriptionRequestController from '../controllers/subscriptionRequestController.js';
import { uploadImages } from '../middlewares/uploadMiddleware.js';

router.use(authMiddleware)

// --- tenant self-service (static paths first so they aren't read as :params) ---
router.get('/me', subscriptionController.myStatus)
router.get('/me/features', subscriptionController.myFeatures)
router.post('/request', permissionMiddleware('manage_subscription'), uploadImages, subscriptionValidate.request, subscriptionRequestController.create)

// --- platform admin: review the manual payment requests (manage_system) ---
router.get('/requests', permissionMiddleware('manage_system'), subscriptionRequestController.listPending)
router.post('/requests/:requestId/approve', permissionMiddleware('manage_system'), idValidate('requestId'), subscriptionRequestController.approve)
router.post('/requests/:requestId/reject', permissionMiddleware('manage_system'), idValidate('requestId'), subscriptionRequestController.reject)

// --- existing admin endpoints ---
router.post('/:tenantId', idValidate('tenantId'), subscriptionValidate.create, subscriptionController.create)
router.get('/', subscriptionController.getAll)
router.get('/:subscriptionId', idValidate('subscriptionId'), subscriptionController.getById)
router.put('/:subscriptionId/tenant/:tenantId', idValidate('subscriptionId'), idValidate('tenantId'), subscriptionValidate.update, subscriptionController.update)

export default router;
