import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import adminPlatformController from '../controllers/adminPlatformController.js';
import adminPlatformValidate from '../validates/adminPlatformValidate.js';

router.post('/register', adminPlatformValidate.register, adminPlatformController.register);
router.get('/tenants', authMiddleware, permissionMiddleware('manage_system'), adminPlatformController.getAll);

export default router;