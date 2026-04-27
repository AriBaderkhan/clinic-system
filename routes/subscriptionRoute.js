import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import idValidate from '../validates/idValidate.js';

import subscriptionValidate from '../validates/subscriptionValidate.js';
import subscriptionController from '../controllers/subscriptionController.js';

router.use(authMiddleware)
router.post('/:tenantId', idValidate('tenantId'), subscriptionValidate.createSubscription, subscriptionController.createSubscription)
router.get('/', subscriptionController.getAllSubscriptions)
router.get('/:subscriptionId', idValidate('subscriptionId'), subscriptionController.getSubscription)
router.put('/:subscriptionId/tenant/:tenantId', idValidate('subscriptionId'), idValidate('tenantId'), subscriptionValidate.updateSubscription, subscriptionController.updateSubscription)



export default router;