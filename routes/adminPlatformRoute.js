import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import adminPlatformController from '../controllers/adminPlatformController.js';
import adminPlatformValidate from '../validates/adminPlatformValidate.js';

// Public - Register New Tenant
router.post('/register', adminPlatformValidate.registerTenant, adminPlatformController.registerTenant);

// Protected - Super Admin Dashboard
// Assuming 'manage_system' is the permission for Platform Admin
router.get('/tenants', authMiddleware, permissionMiddleware('manage_system'), adminPlatformController.getAllTenants);

export default router;
