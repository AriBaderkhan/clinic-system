import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import { uploadImages } from '../middlewares/uploadMiddleware.js';
import validateIdParam from '../validates/idValidate.js';
import announcementValidate from '../validates/announcementValidate.js';
import announcementController from '../controllers/announcementController.js';

router.use(authMiddleware);

// ── Platform admin (manage_system) ──
router.post('/', permissionMiddleware('manage_system'), uploadImages, announcementValidate.create, announcementController.create);
router.get('/admin', permissionMiddleware('manage_system'), announcementController.listAdmin);
router.delete('/:id', permissionMiddleware('manage_system'), validateIdParam('id'), announcementController.remove);

// ── tenant_manager / branch_manager (filtered in the service by role) ──
router.get('/me', announcementController.listForMe);
router.post('/:id/read', validateIdParam('id'), announcementController.markRead);

export default router;
