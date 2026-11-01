import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import planController from '../controllers/planController.js';
import idValidate from '../validates/idValidate.js';
import planValidate from '../validates/planValidate.js';

// Public pricing (no auth). Declared before '/:planId' so it isn't captured as an id.
router.get('/public', planController.getPublic);

// Reading plans: any logged-in user (clinics need them to renew). Changing plans: platform admin only.
router.post('/', authMiddleware, permissionMiddleware('manage_system'), planValidate.create, planController.create);
router.get('/', authMiddleware, planController.getAll);
router.get('/:planId', authMiddleware, idValidate('planId'), planController.getById);
router.put('/:planId', authMiddleware, permissionMiddleware('manage_system'), idValidate('planId'), planValidate.update, planController.update);
router.delete('/:planId', authMiddleware, permissionMiddleware('manage_system'), idValidate('planId'), planController.delete);

export default router;