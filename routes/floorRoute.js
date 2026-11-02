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

// managing floors and who sits where (manage_floors tick)
router.get('/staff', permissionMiddleware('manage_floors'), floorController.getStaff);
router.put('/staff/:userId', permissionMiddleware('manage_floors'), idValidate('userId'), floorValidate.staffFloor, floorController.setStaffFloor);
router.post('/', permissionMiddleware('manage_floors'), floorValidate.save, floorController.create);
router.put('/:floorId', permissionMiddleware('manage_floors'), idValidate('floorId'), floorValidate.save, floorController.update);
router.delete('/:floorId', permissionMiddleware('manage_floors'), idValidate('floorId'), floorController.delete);

export default router;
