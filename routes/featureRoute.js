import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import idValidate from '../validates/idValidate.js';
import featureValidate from '../validates/featureValidate.js';
import featureController from '../controllers/featureController.js';

router.use(authMiddleware);

router.post('/', featureValidate.create, featureController.create);
router.get('/', featureController.getAll);

router.post('/plan/:planId', idValidate('planId'), featureValidate.assign, featureController.assign);
router.get('/plan/:planId', idValidate('planId'), featureController.getPlanFeatures);
router.delete('/plan/:planId/feature/:featureId', idValidate('planId'), idValidate('featureId'), featureController.remove);

export default router;