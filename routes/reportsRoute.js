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

export default router