import express from 'express';
const router = express.Router();

import authController from '../controllers/authController.js';
import authValidate from '../validates/authValidate.js';
import authMiddleware from '../middlewares/authMiddleware.js';

router.post('/login', authValidate.login, authController.login)
router.post('/switch-branch', authMiddleware, authController.switchBranch)
router.get('/me', authMiddleware, authController.me)
router.post('/refresh', authController.refresh)   // no authMiddleware: access token may be expired
router.post('/logout', authController.logout)     // revokes the refresh token

export default router;