import express from 'express';
const router = express.Router();

import feedbackValidate from '../validates/feedbackValidate.js';
import feedbackController from '../controllers/feedbackController.js';

// PUBLIC — no auth.
// QR (walk-in, anonymous): a static per-branch form. Declared BEFORE '/:token'
// so '/qr/..' (3 segments) is never mistaken for a token (1 segment).
router.get('/qr/:tenantId/:branchId', feedbackController.getQrForm);
router.post('/qr/:tenantId/:branchId', feedbackValidate.submit, feedbackController.submitQrForm);

// Token flow: the patient opens this via the wa.me link. The token is the only
// credential; it maps the submission back to the right invite.
router.get('/:token', feedbackController.getPublicForm);
router.post('/:token', feedbackValidate.submit, feedbackController.submitPublicForm);

export default router;
