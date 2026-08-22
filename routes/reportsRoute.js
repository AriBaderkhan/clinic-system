import express from 'express'
const router = express.Router();

import authMiddleware from '../middlewares/authMiddleware.js';
import permissionMiddleware from '../middlewares/permissionMiddleware.js';
import featureMiddleware from '../middlewares/featureMiddleware.js';
import reportsController from '../controllers/reportsController.js';
import reportsValidate from '../validates/reportsValidate.js';
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

// Custom date-range reports are a paid feature; the monthly report stays free.
// Only enforce the feature when the request actually uses a from/to range.
const gateCustomRange = (req, res, next) => {
    if (req.query.from || req.query.to) {
        return featureMiddleware.checkFeature('custom_report')(req, res, next);
    }
    next();
};

router.get('/monthly/pdf', permissionMiddleware('view_reports'), gateCustomRange, reportsValidate.monthly, reportsController.downloadMonthlyPdf)

// Insights assistant (tenant_manager only — role is enforced in the controller).
// Paid feature: gated to plans that include 'insights_assistant' (Pro).
// Catalog = the question menu; :metricId = run one question.
router.get('/insights/catalog', permissionMiddleware('view_reports'), featureMiddleware.checkFeature('insights_assistant'), reportsController.getInsightsCatalog)
// Static insight paths must come BEFORE '/:metricId' so they aren't read as a metric id.
router.get('/insights/meta', permissionMiddleware('view_reports'), featureMiddleware.checkFeature('insights_assistant'), reportsController.getInsightsMeta)
router.get('/insights/excel', permissionMiddleware('view_reports'), featureMiddleware.checkFeature('insights_assistant'), reportsController.downloadInsightsExcel)
router.get('/insights/:metricId', permissionMiddleware('view_reports'), featureMiddleware.checkFeature('insights_assistant'), reportsValidate.insight, reportsController.getInsight)

export default router