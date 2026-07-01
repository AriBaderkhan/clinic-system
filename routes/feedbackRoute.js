import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import featureMiddleware from '../middlewares/featureMiddleware.js';
import feedbackValidate from '../validates/feedbackValidate.js';
import feedbackController from '../controllers/feedbackController.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

// Feedback is part of the same sellable 'reminders' entitlement.
router.use(featureMiddleware.checkFeature('reminders'));

// ── Sending / collecting: reuse 'send_reminders' (reception, managers) ────────
const canSend = permissionMiddleware('send_reminders');

router.get('/template', canSend, feedbackController.getTemplate);
router.put('/template', canSend, feedbackValidate.updateTemplate, feedbackController.updateTemplate);

router.get('/appointments', canSend, feedbackController.getAppointments);

// The ids the branch's static feedback QR encodes (for the settings page).
router.get('/qr-link', canSend, feedbackController.getQrLink);

router.post('/invite', canSend, feedbackValidate.invite, feedbackController.createInvite);
router.post('/dismiss', canSend, feedbackValidate.dismiss, feedbackController.dismiss);

// ── Viewing results: 'view_feedback' (tenant_manager only) ────────────────────
const canView = permissionMiddleware('view_feedback');

router.get('/results', canView, feedbackController.getResults);

export default router;
