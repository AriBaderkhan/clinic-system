import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import prescriptionController from '../controllers/prescriptionController.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

// Only a read-only autocomplete lookup lives here. Creating/editing prescriptions
// happens inside the appointment-complete and session-edit flows.
router.get('/suggest', permissionMiddleware('manage_prescription'), prescriptionController.suggest);

export default router;
