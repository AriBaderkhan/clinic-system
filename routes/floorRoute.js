import express from 'express';
const router = express.Router();

import authMiddleware from "../middlewares/authMiddleware.js";
import branchAssigmentMiddleware from "../middlewares/branchAssigmentMiddleware.js";
import permissionMiddleware from "../middlewares/permissionMiddleware.js";
import idValidate from "../validates/idValidate.js";
import floorValidate from "../validates/floorValidate.js";
import floorController from "../controllers/floorController.js";

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

// everyone who sees appointments needs the floor list for the filter
router.get('/', permissionMiddleware('view_appointment'), floorController.getAll);

// managing floors and who sits where = both managers (branch settings)
router.get('/staff', permissionMiddleware('manage_branch_settings'), floorController.getStaff);
router.put('/staff/:userId', permissionMiddleware('manage_branch_settings'), idValidate('userId'), floorValidate.staffFloor, floorController.setStaffFloor);
router.post('/', permissionMiddleware('manage_branch_settings'), floorValidate.save, floorController.create);
router.put('/:floorId', permissionMiddleware('manage_branch_settings'), idValidate('floorId'), floorValidate.save, floorController.update);
router.delete('/:floorId', permissionMiddleware('manage_branch_settings'), idValidate('floorId'), floorController.delete);

export default router;
