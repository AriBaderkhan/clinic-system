import express from 'express'
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js'
import permissionMiddleware from '../middlewares/permissionMiddleware.js'
import settingController from '../controllers/settingController.js';
import settingValidate from '../validates/settingValidate.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware)
router.use(branchAssigmentMiddleware)

router.get('/effective', settingController.getEffective)
// everyone in the branch reads the switches (the pay / booking screens follow them)
router.get('/workflow', settingController.getWorkflow)
router.put('/workflow', permissionMiddleware('manage_branch_settings'), settingValidate.workflow, settingController.updateWorkflow)

export default router;
