import express from 'express';
const router = express.Router();

import authController from '../controllers/authController.js';
import authValidate from '../validates/authValidate.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  max: 10,                    // 10 tries per IP
  message: { message: 'Too many attempts, try again later', code: 'RATE_LIMITED' },
});

router.post('/login', loginLimiter,authValidate.login, authController.login)
router.post('/switch-branch', authMiddleware, authController.switchBranch)
router.get('/me', authMiddleware, authController.me)
router.post('/refresh', authController.refresh)   // no authMiddleware: access token may be expired
router.post('/logout', authController.logout)     // revokes the refresh token

export default router;