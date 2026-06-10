import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import planController from '../controllers/planController.js';
import idValidate from '../validates/idValidate.js';
import planValidate from '../validates/planValidate.js';

router.post('/', authMiddleware, planValidate.create, planController.create);
router.get('/', authMiddleware, planController.getAll);
router.get('/:planId', authMiddleware, idValidate('planId'), planController.getById);
router.put('/:planId', authMiddleware, idValidate('planId'), planValidate.update, planController.update);
router.delete('/:planId', authMiddleware, idValidate('planId'), planController.delete);

export default router;