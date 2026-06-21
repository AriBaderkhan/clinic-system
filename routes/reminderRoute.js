import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import featureMiddleware from '../middlewares/featureMiddleware.js';
import validateIdParam from '../validates/idValidate.js';
import reminderValidate from '../validates/reminderValidate.js';
import reminderController from '../controllers/reminderController.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

router.use(permissionMiddleware('send_reminders'))
// Every route requires: the tenant's plan includes 'reminders' AND the user's
// role has 'send_reminders'.
// const feature = featureMiddleware.checkFeature('reminders');

router.get('/upcoming',  reminderController.getUpcoming);
router.get('/template',  reminderController.getTemplate);
router.put('/template', reminderValidate.updateTemplate, reminderController.updateTemplate);
router.post('/:appointmentId/sent', validateIdParam('appointmentId'), reminderValidate.markSent, reminderController.markSent);

export default router;
