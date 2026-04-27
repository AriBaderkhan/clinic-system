import express from 'express'
const router = express.Router();


import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
// import validateIdParam from '../validates/idValidate.js';
import reportsController from '../controllers/reportsController.js';
import reportsValidate from '../validates/reportsValidate.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

router.get('/monthly/pdf', permissionMiddleware('view_reports'), reportsValidate.validateReportMonthly, reportsController.controllerMonthlyReportPdf)



export default router