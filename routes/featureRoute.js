import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import idValidate from '../validates/idValidate.js';
import featureValidate from '../validates/featureValidate.js';
import featureController from '../controllers/featureController.js';

router.use(authMiddleware);

// Features
router.post('/', featureValidate.createFeature, featureController.createFeature);
router.get('/', featureController.getFeatures);

// Plan Assignments
// Url: /api/features/plan/:planId
router.post('/plan/:planId', idValidate('planId'), featureValidate.assignFeature, featureController.assignFeature);
router.get('/plan/:planId', idValidate('planId'), featureController.getPlanFeatures);
router.delete('/plan/:planId/feature/:featureId', idValidate('planId'), idValidate('featureId'), featureController.removeFeature);

export default router;
