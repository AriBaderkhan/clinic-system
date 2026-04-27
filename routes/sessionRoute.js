import express from 'express';
const router = express.Router();



import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import validateIdParam from '../validates/idValidate.js';
import sessionValidate from '../validates/sessionValidate.js';
import sessionController from '../controllers/sessionController.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

// /api/sessions/
router.get('/', permissionMiddleware('view_session'), sessionValidate.validateListASessionFilters, sessionController.controllerGetAllSessions);
router.get('/:sessionId/normal', permissionMiddleware('view_session'), validateIdParam('sessionId'), sessionController.controllerGetNormalSession);
router.put('/:sessionId/normal', permissionMiddleware('edit_session'), validateIdParam('sessionId'), sessionValidate.validateEditSession, sessionController.controllerEditNormalSession);

router.get('/unpaid', permissionMiddleware('view_session'), sessionController.controllerGetAllUnPaidSessions);

router.get('/:sessionId', permissionMiddleware('view_session'), validateIdParam('sessionId'), sessionController.controllerGetSession);
// router.put('/:sessionId', roleCheck('doctor','reception','assistant'),validateIdParam('sessionId'), sessionValidate.validateUpdateSession,sessionController.controllerUpdateSession); 
// router.delete('/:sessionId', permissionMiddleware('delete_session'), validateIdParam('sessionId'), sessionController.controllerDeleteSession);

router.post('/:sessionId/pay', permissionMiddleware('collect_payment'), validateIdParam('sessionId'), sessionController.controllerPaySession);


export default router;