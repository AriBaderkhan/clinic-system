import subscriptionModel from '../models/subscriptionModel.js';
import appError from '../utils/appError.js';
import asyncWrap from '../utils/asyncWrap.js';

const checkFeature = (featureCode) => {
    return asyncWrap(async (req, res, next) => {
        const { tenant_id } = req.user;

        // the plan's features + this clinic's extras (one source for routes and screens)
        const codes = await subscriptionModel.getTenantFeatureCodes(tenant_id);

        if (!codes.includes(featureCode)) {
            // Pass the feature as meta so the frontend can translate the sentence
            // and fill in {{feature}} in the chosen language.
            throw appError('FEATURE_NOT_INCLUDED', `Your plan does not include: ${featureCode}`, 403, { feature: featureCode });
        }

        next();
    });
};

export default { checkFeature };
