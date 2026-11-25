import express from 'express';
const router = express.Router()

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import tenantController from '../controllers/tenantController.js';
import validateIdParam from '../validates/idValidate.js';
import tenantValidate from '../validates/tenantValidate.js';

router.use(authMiddleware)

router.get('/dashboard', permissionMiddleware('manage_tenant_settings'), tenantController.getDashboard);
router.get('/', permissionMiddleware('manage_tenant_settings'), tenantController.getDetails);
router.put('/', permissionMiddleware('manage_tenant_settings'), tenantValidate.update, tenantController.update);
router.get('/branches', permissionMiddleware('manage_branches'), tenantController.getBranches);
router.post('/branches', permissionMiddleware('manage_branches'), tenantValidate.createBranch, tenantController.createBranch);
router.post('/switch-branch/:branchId', permissionMiddleware('manage_branches'), validateIdParam('branchId'), tenantController.switchBranch)
router.put('/branches/:id', permissionMiddleware('manage_branches'), validateIdParam('id'), tenantValidate.updateBranch, tenantController.updateBranch);
router.delete('/branches/:id', permissionMiddleware('manage_branches'), validateIdParam('id'), tenantController.deleteBranch);

export default router;