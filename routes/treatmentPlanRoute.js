import express from 'express';
const router = express.Router();

import treatmentController from '../controllers/treatmentPlanController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import roleCheck from '../middlewares/roleMiddleware.js';

import validateIdParam from '../validates/idValidate.js';

router.get('/active',authMiddleware,roleCheck('reception','doctor','super_doctor'),treatmentController.controllerGetActivePlan);
router.get('/:treatmentPlanId/sessions',authMiddleware,roleCheck('reception','doctor','super_doctor'),validateIdParam('treatmentPlanId'),treatmentController.controllerGetSessionsForTp);



export default router;