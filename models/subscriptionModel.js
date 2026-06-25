import pool from '../db_connection.js';

async function createSubscription(tenantId, planId) {
    const { rows } = await pool.query(
        'INSERT INTO subscriptions (tenant_id, plan_id) VALUES ($1, $2) RETURNING *',
        [tenantId, planId]
    );
    return rows[0];
}

async function getAllSubscriptions() {
    const { rows } = await pool.query(`
        SELECT s.id,
        s.tenant_id,
        s.plan_id,
        s.status,
        s.start_date,
        s.end_date,
        p.name AS plan_name,
        t.name AS tenant_name
        FROM subscriptions s
        JOIN plans p ON s.plan_id = p.id
        JOIN tenants t ON s.tenant_id = t.id
        `);
    return rows;
}

async function getSubscription(subscriptionId) {
    const { rows } = await pool.query(`
        SELECT s.id,
        s.tenant_id,
        s.plan_id,
        s.status,
        s.start_date,
        s.end_date,
        p.name AS plan_name,
        t.name AS tenant_name
        FROM subscriptions s
        JOIN plans p ON s.plan_id = p.id
        JOIN tenants t ON s.tenant_id = t.id
        WHERE s.id = $1
        `, [subscriptionId]);
    return rows[0];
}

async function updateSubscription(subscriptionId, tenantId, body) {
    const { rows } = await pool.query(
        `UPDATE subscriptions SET
        tenant_id= COALESCE($2, tenant_id),
         plan_id= COALESCE($3, plan_id),
         status= COALESCE($4, status)
        WHERE id = $1 RETURNING *`,
        [subscriptionId, tenantId, body.plan_id, body.status]
    );
    return rows[0];
}

// The tenant's single subscription, enriched with its plan.
async function getByTenant(tenant_id) {
    const { rows } = await pool.query(
        `SELECT s.id, s.tenant_id, s.plan_id, s.status, s.start_date, s.end_date,
                p.name AS plan_name, p.price AS plan_price,
                p.max_branches, p.max_users
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
         WHERE s.tenant_id = $1
         ORDER BY s.id DESC
         LIMIT 1`,
        [tenant_id]
    );
    return rows[0] || null;
}

// Renew/upgrade the tenant's existing subscription row (one per tenant — never
// insert a second). New period = GREATEST(now, end_date) + N days, so renewing
// early in the warning window extends instead of losing remaining days.
async function renewForTenant(tenant_id, plan_id, days, client = pool) {
    const { rows } = await client.query(
        `UPDATE subscriptions
         SET plan_id = $2,
             start_date = NOW(),
             end_date = GREATEST(NOW(), COALESCE(end_date, NOW())) + ($3 || ' days')::interval,
             status = 'active'
         WHERE tenant_id = $1
         RETURNING *`,
        [tenant_id, plan_id, String(days)]
    );
    return rows[0] || null;
}

// Feature codes included in the tenant's current plan (for UI hiding).
async function getTenantFeatureCodes(tenant_id) {
    const { rows } = await pool.query(
        `SELECT f.code
         FROM subscriptions s
         JOIN plan_features pf ON pf.plan_id = s.plan_id
         JOIN features f ON f.id = pf.feature_id
         WHERE s.tenant_id = $1`,
        [tenant_id]
    );
    return rows.map((r) => r.code);
}

export default {
    createSubscription, getAllSubscriptions, getSubscription, updateSubscription,
    getByTenant, renewForTenant, getTenantFeatureCodes
}
