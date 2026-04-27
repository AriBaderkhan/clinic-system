import express from 'express';
const router = express.Router();

import authController from '../controllers/authController.js';
import authValidate from '../validates/authValidate.js';
import authMiddleware from '../middlewares/authMiddleware.js';

router.post('/login', authValidate.validateLogin, authController.controllerLogin)
router.post('/switch-branch', authMiddleware, authController.controllerSwitchBranch)


export default router;