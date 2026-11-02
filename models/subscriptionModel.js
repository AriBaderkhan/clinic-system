import pool from '../db_connection.js';

// Always with a real end date — a row without one would never expire.
async function createSubscription(tenantId, planId, days, billingPeriod) {
    const { rows } = await pool.query(
        `INSERT INTO subscriptions (tenant_id, plan_id, status, start_date, end_date, billing_period)
         VALUES ($1, $2, 'active', NOW(), NOW() + ($3 || ' days')::interval, $4) RETURNING *`,
        [tenantId, planId, String(days), billingPeriod]
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
        s.billing_period,
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
        `SELECT s.id, s.tenant_id, s.plan_id, s.status, s.start_date, s.end_date, s.billing_period,
                s.locked_price, s.locked_yearly_price, s.locked_included_doctors,
                p.name AS plan_name, p.price AS plan_price, p.yearly_price AS plan_yearly_price,
                p.max_branches, p.max_users, p.included_doctors, p.extra_doctor_price, p.extra_doctor_yearly_price
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
// Moving to ANOTHER plan ends the clinic's price lock (the new plan's terms apply).
async function renewForTenant(tenant_id, plan_id, days, billing_period, client = pool) {
    const { rows } = await client.query(
        `UPDATE subscriptions
         SET plan_id = $2,
             locked_price            = CASE WHEN plan_id = $2 THEN locked_price ELSE NULL END,
             locked_yearly_price     = CASE WHEN plan_id = $2 THEN locked_yearly_price ELSE NULL END,
             locked_included_doctors = CASE WHEN plan_id = $2 THEN locked_included_doctors ELSE NULL END,
             start_date = NOW(),
             end_date = GREATEST(NOW(), COALESCE(end_date, NOW())) + ($3 || ' days')::interval,
             billing_period = $4,
             status = 'active'
         WHERE tenant_id = $1
         RETURNING *`,
        [tenant_id, plan_id, String(days), billing_period]
    );
    return rows[0] || null;
}

// Feature codes the tenant has: its plan's features + extras the admin gave this clinic (not expired).
// The ONE place features are decided (route checks and UI hiding both use it).
async function getTenantFeatureCodes(tenant_id) {
    const { rows } = await pool.query(
        `SELECT f.code
         FROM subscriptions s
         JOIN plan_features pf ON pf.plan_id = s.plan_id
         JOIN features f ON f.id = pf.feature_id
         WHERE s.tenant_id = $1
         UNION
         SELECT f.code
         FROM tenant_feature_grants g
         JOIN features f ON f.id = g.feature_id
         WHERE g.tenant_id = $1 AND (g.expires_at IS NULL OR g.expires_at > NOW())`,
        [tenant_id]
    );
    return rows.map((r) => r.code);
}

// Doctors the clinic pays for: active people holding a role that treats patients (any branch, counted once).
async function countActiveDoctors(tenant_id, client = pool) {
    const { rows } = await client.query(
        `SELECT count(DISTINCT ubr.user_id)::int AS n
         FROM user_branch_roles ubr
         JOIN roles r ON r.id = ubr.role_id AND r.is_doctor
         JOIN users u ON u.id = ubr.user_id AND u.is_active
         WHERE ubr.tenant_id = $1 AND ubr.is_active`,
        [tenant_id]
    );
    return rows[0].n;
}

// is this person already counted as one of the clinic's doctors?
async function isCountedDoctor(user_id, tenant_id, client = pool) {
    const { rows } = await client.query(
        `SELECT EXISTS (
            SELECT 1 FROM user_branch_roles ubr
            JOIN roles r ON r.id = ubr.role_id AND r.is_doctor
            JOIN users u ON u.id = ubr.user_id AND u.is_active
            WHERE ubr.user_id = $1 AND ubr.tenant_id = $2 AND ubr.is_active) AS yes`,
        [user_id, tenant_id]
    );
    return rows[0].yes;
}

// does this person hold a doctor role (even while the account is switched off)?
async function hasDoctorRole(user_id, tenant_id, client = pool) {
    const { rows } = await client.query(
        `SELECT EXISTS (
            SELECT 1 FROM user_branch_roles ubr
            JOIN roles r ON r.id = ubr.role_id AND r.is_doctor
            WHERE ubr.user_id = $1 AND ubr.tenant_id = $2 AND ubr.is_active) AS yes`,
        [user_id, tenant_id]
    );
    return rows[0].yes;
}

export default {
    createSubscription, getAllSubscriptions, getSubscription, updateSubscription,
    getByTenant, renewForTenant, getTenantFeatureCodes, countActiveDoctors, isCountedDoctor, hasDoctorRole
}
