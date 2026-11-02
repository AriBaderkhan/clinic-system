import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import idValidate from '../validates/idValidate.js';
import featureValidate from '../validates/featureValidate.js';
import featureController from '../controllers/featureController.js';

// Platform admin only (clinics read their own features via /api/subscriptions/me/features)
router.use(authMiddleware);
router.use(permissionMiddleware('manage_system'));

router.post('/', featureValidate.create, featureController.create);
router.get('/', featureController.getAll);

router.post('/plan/:planId', idValidate('planId'), featureValidate.assign, featureController.assign);
router.get('/plan/:planId', idValidate('planId'), featureController.getPlanFeatures);
router.delete('/plan/:planId/feature/:featureId', idValidate('planId'), idValidate('featureId'), featureController.remove);

// per-clinic extras: give one clinic a feature (trial / deal), optionally until a date
router.get('/tenant/:tenantId', idValidate('tenantId'), featureController.getTenantGrants);
router.post('/tenant/:tenantId', idValidate('tenantId'), featureValidate.grant, featureController.grant);
router.delete('/tenant/:tenantId/feature/:featureId', idValidate('tenantId'), idValidate('featureId'), featureController.revoke);

export default router;