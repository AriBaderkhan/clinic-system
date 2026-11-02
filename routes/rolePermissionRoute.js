import express from 'express';
const router = express.Router();

import authMiddleware from "../middlewares/authMiddleware.js";
import branchAssigmentMiddleware from "../middlewares/branchAssigmentMiddleware.js";
import permissionMiddleware from "../middlewares/permissionMiddleware.js";
import idValidate from "../validates/idValidate.js";
import rolePermissionValidate from "../validates/rolePermissionValidate.js";
import rolePermissionController from "../controllers/rolePermissionController.js";

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);
router.use(permissionMiddleware('manage_permissions'));

// what each role can do in the CURRENT branch
router.get('/', rolePermissionController.getRoles);
router.get('/:roleId', idValidate('roleId'), rolePermissionController.getRole);
router.put('/:roleId', idValidate('roleId'), rolePermissionValidate.update, rolePermissionController.updateRole);

// custom roles (plan feature custom_roles — checked in the service)
router.post('/', rolePermissionValidate.create, rolePermissionController.createRole);
router.patch('/:roleId', idValidate('roleId'), rolePermissionValidate.rename, rolePermissionController.renameRole);
router.delete('/:roleId', idValidate('roleId'), rolePermissionController.deleteRole);

export default router;
