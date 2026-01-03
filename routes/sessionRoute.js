import express from 'express';
const router = express.Router();



import authMiddleware from '../middlewares/authMiddleware.js';
import roleCheck from '../middlewares/roleMiddleware.js';
import validateIdParam from '../validates/idValidate.js';
import sessionValidate from '../validates/sessionValidate.js';
import sessionController from '../controllers/sessionController.js';


router.use(authMiddleware);
router.post('/appointment/:appointmentId', roleCheck('doctor'), sessionValidate.validateCreateSession, sessionController.controllerCreateSession); 
router.get('/', roleCheck('doctor','reception','assistant'), sessionController.controllerGetAllSessions);

router.get('/unpaid', roleCheck('reception'), sessionController.controllerGetAllUnPaidSessions); 

router.get('/:sessionId', roleCheck('doctor','reception','super_doctor'),validateIdParam('sessionId'), sessionController.controllerGetSession); 
router.put('/:sessionId', roleCheck('doctor','reception','assistant'),validateIdParam('sessionId'), sessionValidate.validateUpdateSession,sessionController.controllerUpdateSession); 
router.delete('/:sessionId', roleCheck('doctor','reception'),validateIdParam('sessionId'), sessionController.controllerDeleteSession); 

router.post('/:sessionId/pay',roleCheck('reception'),validateIdParam('sessionId'),sessionController.controllerPaySession);


export default router;