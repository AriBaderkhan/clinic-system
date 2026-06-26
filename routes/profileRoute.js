import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import { uploadImages } from '../middlewares/uploadMiddleware.js';
import profileValidate from '../validates/profileValidate.js';
import profileController from '../controllers/profileController.js';

// Any logged-in user manages their OWN profile. No extra permission — every
// handler is scoped to req.user.id, so no one can touch another user's record.
router.use(authMiddleware);

router.get('/me', profileController.getMe);
router.put('/me', uploadImages, profileValidate.update, profileController.updateMe);
router.put('/me/password', profileValidate.password, profileController.changePassword);
router.post('/me/email/send-code', profileValidate.emailSend, profileController.sendEmailCode);
router.put('/me/email', profileValidate.emailChange, profileController.changeEmail);

export default router;
