import pool from '../db_connection.js';
import appError from '../utils/appError.js';
import asyncWrap from '../utils/asyncWrap.js';

// 1. Check Max Branches
const checkMaxBranches = asyncWrap(async (req, res, next) => {
    const { tenant_id } = req.user;

    // A. Get Plan Limit
    const planQuery = `
        SELECT p.max_branches 
        FROM subscriptions s
        JOIN plans p ON s.plan_id = p.id
        WHERE s.tenant_id = $1 
    `;
    const planRes = await pool.query(planQuery, [tenant_id]);

    // If no plan found, block (Safety)
    if (planRes.rows.length === 0) {
        throw appError('NO_active_PLAN', 'No active subscription found.', 403);
    }
    const limit = planRes.rows[0].max_branches;

    // B. Check if Unlimited (-1)
    if (limit === -1) return next();

    // C. Count Current Branches
    const countRes = await pool.query('SELECT COUNT(*) FROM branches WHERE tenant_id = $1', [tenant_id]);
    const currentCount = parseInt(countRes.rows[0].count);

    // D. Compare
    if (currentCount >= limit) {
        throw appError('PLAN_LIMIT_REACHED', `Upgrade Plan: Max branches reached (${limit}).`, 403);
    }

    next();
});


export default { checkMaxBranches };
