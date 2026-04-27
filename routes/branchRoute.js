import express from 'express';
const router = express.Router()

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import idValidate from '../validates/idValidate.js'

import branchController from '../controllers/branchController.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware)
router.use(branchAssigmentMiddleware)

router.get(
    '/:branchId',
    permissionMiddleware('manage_branch_settings'),
    idValidate('branchId'),
    branchController.getBranchDetails
);



router.put(
    '/:branchId',
    permissionMiddleware('manage_branch_settings'),
    idValidate('branchId'),
    branchController.updateBranch
);

export default router;