import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import validateIdParam from '../validates/idValidate.js';
import notificationController from '../controllers/notificationController.js';

router.use(authMiddleware);

// Every logged-in user reads / reads-off their OWN notifications.
router.get('/', notificationController.getMine);
router.post('/:id/read', validateIdParam('id'), notificationController.markRead);

export default router;
