import express from 'express';
const router = express.Router();

import treatmentController from '../controllers/treatmentPlanController.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import scopeMiddleware from "../middlewares/scopeMiddleware.js";
import tPValidate from '../validates/treatmentPlanValidate.js';
import validateIdParam from '../validates/idValidate.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware)
router.use(branchAssigmentMiddleware)

router.get('/', permissionMiddleware('manage_tp'), treatmentController.getAll);
router.get('/active', permissionMiddleware('manage_tp'), scopeMiddleware.patient, treatmentController.getActive);
router.get('/:treatmentPlanId/sessions', permissionMiddleware('manage_tp'), validateIdParam('treatmentPlanId'), scopeMiddleware.plan, treatmentController.getSessions);
router.patch('/:treatmentPlanId', permissionMiddleware('manage_tp'), validateIdParam('treatmentPlanId'), tPValidate.update, scopeMiddleware.plan, treatmentController.update);
router.delete('/:treatmentPlanId', permissionMiddleware('manage_tp'), validateIdParam('treatmentPlanId'), scopeMiddleware.plan, treatmentController.delete);
router.patch(
    "/:treatmentPlanId/sessions/:sessionId/paid",
    permissionMiddleware('edit_payment'),
    validateIdParam("treatmentPlanId"),
    validateIdParam("sessionId"),
    tPValidate.paid,
    scopeMiddleware.plan,
    treatmentController.updatePaidSession
);

export default router;