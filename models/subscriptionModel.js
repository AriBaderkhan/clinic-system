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
export default { createSubscription, getAllSubscriptions, getSubscription, updateSubscription }
