import express from 'express'

import authMiddleware from "../middlewares/authMiddleware.js";
import permissionCheck from "../middlewares/permissionMiddleware.js";
import idValidate from "../validates/idValidate.js";
import userController from "../controllers/userController.js";
import userValidate from "../validates/userValidate.js";

const router = express.Router();

router.use(authMiddleware);
router.use(permissionCheck('manage_users'));

router.post('/', userValidate.create, userController.create); // staff are free; doctor seats are checked in the user service
router.get('/', userController.getAll);
router.get('/roles', userController.getRoles);

router.put('/:userId', idValidate('userId'), userController.update);
router.delete('/:userId', idValidate('userId'), userController.deactivate);
router.get('/:userId', idValidate('userId'), userController.getById);

router.post('/:userId/assign', idValidate('userId'), userValidate.assign, userController.assignToBranch)

export default router;