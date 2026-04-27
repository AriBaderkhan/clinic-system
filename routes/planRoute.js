import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import planController from '../controllers/planController.js';
import idValidate from '../validates/idValidate.js';
import planValidate from '../validates/planValidate.js';


router.post('/', authMiddleware, planValidate.planCreate, planController.createPlan);
router.get('/', authMiddleware, planController.getPlans);
router.get('/:planId', authMiddleware, idValidate('planId'), planController.getPlanById);
router.put('/:planId', authMiddleware, idValidate('planId'), planValidate.planUpdate, planController.updatePlan);
router.delete('/:planId', authMiddleware, idValidate('planId'), planController.deletePlan);

export default router;