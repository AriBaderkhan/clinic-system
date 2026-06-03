import express from 'express';
const router = express.Router()

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';

import tenantController from '../controllers/tenantController.js';
import validateIdParam from '../validates/idValidate.js';
import planMiddleware from '../middlewares/planMiddleware.js';

router.use(authMiddleware)

router.get(
    '/',
    permissionMiddleware('manage_tenant_settings'),
    tenantController.getTenantDetails
);

router.put(
    '/',
    permissionMiddleware('manage_tenant_settings'),
    tenantController.updateTenant
);

router.get(
    '/branches',
    permissionMiddleware('manage_branches'),
    tenantController.getAllBranches
);

router.post(
    '/branches',
    permissionMiddleware('manage_branches'),
    planMiddleware.checkMaxBranches,
    tenantController.createBranch
);

router.post(
    '/switch-branch/:branchId', 
    permissionMiddleware('manage_branches'),
    validateIdParam('branchId'),
    tenantController.switchBranch
)

router.put(
    '/branches/:id',
    permissionMiddleware('manage_branches'),
    validateIdParam('id'),
    tenantController.updateBranch
);

router.delete(
    '/branches/:id',
    permissionMiddleware('manage_branches'),
    validateIdParam('id'),
    tenantController.deleteBranch
);
export default router;