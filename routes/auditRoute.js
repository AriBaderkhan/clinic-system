import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import featureMiddleware from '../middlewares/featureMiddleware.js';
import auditController from '../controllers/auditController.js';

router.use(authMiddleware);

// Two gates, like reminders:
//  1) the tenant's PLAN includes 'audit_log' (billing/entitlement — Pro)
//  2) the user's ROLE has 'view_audit_log' (RBAC — tenant_manager)
router.get(
    '/',
    featureMiddleware.checkFeature('audit_log'),
    permissionMiddleware('view_audit_log'),
    auditController.list
);

export default router;
