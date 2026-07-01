import express from 'express';
const router = express.Router();

import feedbackValidate from '../validates/feedbackValidate.js';
import feedbackController from '../controllers/feedbackController.js';

// PUBLIC — no auth. The patient opens this via the wa.me link. The token is the
// only credential; it maps the submission back to the right invite.
router.get('/:token', feedbackController.getPublicForm);
router.post('/:token', feedbackValidate.submit, feedbackController.submitPublicForm);

export default router;
