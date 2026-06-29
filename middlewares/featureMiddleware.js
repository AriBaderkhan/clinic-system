import pool from '../db_connection.js';
import appError from '../utils/appError.js';
import asyncWrap from '../utils/asyncWrap.js';

const checkFeature = (featureCode) => {
    return asyncWrap(async (req, res, next) => {
        const { tenant_id } = req.user;

        // Query: Does Tenant -> Plan -> Have this Feature Code?
        const query = `
            SELECT 1 
            FROM subscriptions s
            JOIN plan_features pf ON s.plan_id = pf.plan_id
            JOIN features f ON pf.feature_id = f.id
            WHERE s.tenant_id = $1 AND f.code = $2
        `;

        const { rows } = await pool.query(query, [tenant_id, featureCode]);

        if (rows.length === 0) {
            // Pass the feature as meta so the frontend can translate the sentence
            // and fill in {{feature}} in the chosen language.
            throw appError('FEATURE_NOT_INCLUDED', `Your plan does not include: ${featureCode}`, 403, { feature: featureCode });
        }

        next();
    });
};

export default { checkFeature };
