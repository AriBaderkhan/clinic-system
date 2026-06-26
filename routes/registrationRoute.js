import express from 'express';
const router = express.Router();

import rateLimit from 'express-rate-limit';
import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import { uploadImages } from '../middlewares/uploadMiddleware.js';
import validateIdParam from '../validates/idValidate.js';
import registrationValidate from '../validates/registrationValidate.js';
import registrationController from '../controllers/registrationController.js';

// Public endpoints are internet-facing → throttle to curb spam/abuse.
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' },
});

// ── Public (no auth) ──
router.post('/send-code', publicLimiter, registrationValidate.sendCode, registrationController.sendCode);
router.post('/verify-code', publicLimiter, registrationValidate.verifyCode, registrationController.verifyCode);
router.post('/', publicLimiter, uploadImages, registrationValidate.create, registrationController.create);

// ── Platform admin (manage_system) ──
router.get('/requests', authMiddleware, permissionMiddleware('manage_system'), registrationController.listPending);
router.post('/requests/:id/approve', authMiddleware, permissionMiddleware('manage_system'), validateIdParam('id'), registrationController.approve);
router.post('/requests/:id/reject', authMiddleware, permissionMiddleware('manage_system'), validateIdParam('id'), registrationController.reject);

export default router;
