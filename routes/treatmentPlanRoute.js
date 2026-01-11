import express from 'express';
const router = express.Router();

import treatmentController from '../controllers/treatmentPlanController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import roleCheck from '../middlewares/roleMiddleware.js';

import tPValidate from '../validates/treatmentPlanValidate.js';
import validateIdParam from '../validates/idValidate.js';

router.get('/', authMiddleware, roleCheck('reception'), treatmentController.controllerGetAllTreatmentPlansForSection);
router.get('/active', authMiddleware, roleCheck('reception', 'doctor', 'super_doctor'), treatmentController.controllerGetActivePlan);
router.get('/:treatmentPlanId/sessions', authMiddleware, roleCheck('reception', 'doctor', 'super_doctor'), validateIdParam('treatmentPlanId'), treatmentController.controllerGetSessionsForTp);

router.patch('/:treatmentPlanId', authMiddleware, roleCheck('reception'), validateIdParam('treatmentPlanId'), tPValidate.validateEditTp, treatmentController.controllerEditTp);
router.delete('/:treatmentPlanId', authMiddleware, roleCheck('reception'), validateIdParam('treatmentPlanId'), treatmentController.controllereDeleteTp);
router.patch(
    "/:treatmentPlanId/sessions/:sessionId/paid",
    authMiddleware,
    roleCheck("reception"),
    validateIdParam("treatmentPlanId"),
    validateIdParam("sessionId"),
    treatmentController.controllerUpdatePaidForTpSession
);




export default router;