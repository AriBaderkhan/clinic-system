import express from 'express'

import authMiddleware from "../middlewares/authMiddleware.js";
import permissionCheck from "../middlewares/permissionMiddleware.js";
import idValidate from "../validates/idValidate.js";
import userController from "../controllers/userController.js";
import userValidate from "../validates/userValidate.js";
import planMiddleware from "../middlewares/planMiddleware.js";

const router = express.Router();

router.use(authMiddleware);
router.use(permissionCheck('manage_users'));

router.post('/', planMiddleware.checkMaxUsers, userValidate.createUser, userController.createUser);
router.get('/', userController.getAllUsers);
router.get('/roles', userController.getRoles);

router.put('/:userId', idValidate('userId'), userController.updateUser);
router.get('/:userId', idValidate('userId'), userController.getUserById);

router.post('/:userId/assign', idValidate('userId'), userController.assigendToTheBranch)

export default router;