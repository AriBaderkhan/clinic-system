import express from 'express';
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import scopeMiddleware from "../middlewares/scopeMiddleware.js";
import featureMiddleware from '../middlewares/featureMiddleware.js';
import docController from '../controllers/docController.js';
import reportsValidate from '../validates/reportsValidate.js';
import validateIdParam from '../validates/idValidate.js';
import docValidate from '../validates/docValidate.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

// Custom date-range is the same paid feature as the general report; the monthly
// view stays free. Only enforce it when the request actually uses a from/to range.
const gateCustomRange = (req, res, next) => {
    if (req.query.from || req.query.to) {
        return featureMiddleware.checkFeature('custom_report')(req, res, next);
    }
    next();
};

router.get('/', permissionMiddleware('view_doctor'), docController.getAll)
router.get("/appointments/per-doctor", permissionMiddleware('view_appointment'), docController.getAppointments);
router.get("/active/appointments/today", permissionMiddleware('view_appointment'), docController.getActiveToday);
router.get("/active/appointments/open", permissionMiddleware('view_appointment'), docController.getOpenAppts);

// The doctor's own report (current branch) — on-screen JSON + downloadable PDF.
router.get('/report', permissionMiddleware('view_own_report'), gateCustomRange, reportsValidate.monthly, docController.getMyReport);
router.get('/report/pdf', permissionMiddleware('view_own_report'), gateCustomRange, reportsValidate.monthly, docController.downloadMyReportPdf);

router.get('/:appointmentId/session', permissionMiddleware('view_session'), validateIdParam('appointmentId'), scopeMiddleware.appointment, docController.getSession);

// a doctor's specialty + extra treatments (both managers)
router.get('/:doctorId/settings', permissionMiddleware('manage_works'), validateIdParam('doctorId'), docController.getSettings);
router.put('/:doctorId/settings', permissionMiddleware('manage_works'), validateIdParam('doctorId'), docValidate.settings, docController.saveSettings);

export default router;