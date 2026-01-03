import express from 'express'
const router = express.Router();


import authMiddleware from '../middlewares/authMiddleware.js';
import roleCheck from '../middlewares/roleMiddleware.js';
// import validateIdParam from '../validates/idValidate.js';
import reportsController from '../controllers/reportsController.js';
import reportsValidate from '../validates/reportsValidate.js';

router.use(authMiddleware);

router.get('/monthly/pdf',roleCheck('reception','super_doctor'), reportsValidate.validateReportMonthly, reportsController.controllerMonthlyReportPdf)



export default router