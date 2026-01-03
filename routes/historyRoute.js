import express from 'express'
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import roleCheck from '../middlewares/roleMiddleware.js';
import historyController from '../controllers/historyController.js';
import validateIdParam from '../validates/idValidate.js';

router.use(authMiddleware)

router.get('/payments', roleCheck('reception'), historyController.controllerPaymentsHistory)
router.get('/session/:sessionId/details', roleCheck('reception','doctor','super_doctor'), validateIdParam('sessionId'), historyController.controllerGetSessionDetails)
// add doc and super
export default router;