import express from 'express';
const router = express.Router();

import authController from '../controllers/authController.js';
import authValidate from '../validates/authValidate.js';
import authMiddleware from '../middlewares/authMiddleware.js';

router.post('/login', authValidate.login, authController.login)
router.post('/switch-branch', authMiddleware, authController.switchBranch)

export default router;