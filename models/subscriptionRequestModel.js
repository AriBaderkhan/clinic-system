import pool from '../db_connection.js';

// Create a pending renew/upgrade request (with the uploaded evidence path).
async function createRequest({ tenant_id, plan_id, amount, evidence_path }) {
    const { rows } = await pool.query(
        `INSERT INTO subscription_requests (tenant_id, plan_id, amount, evidence_path)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [tenant_id, plan_id, amount ?? null, evidence_path ?? null]
    );
    return rows[0];
}

// The tenant's current pending request (only one allowed at a time).
async function getPendingByTenant(tenant_id) {
    const { rows } = await pool.query(
        `SELECT sr.*, p.name AS plan_name
         FROM subscription_requests sr
         JOIN plans p ON p.id = sr.plan_id
         WHERE sr.tenant_id = $1 AND sr.status = 'pending'
         ORDER BY sr.created_at DESC
         LIMIT 1`,
        [tenant_id]
    );
    return rows[0] || null;
}

// Platform-admin queue: all pending requests with tenant + plan names.
async function listByStatus(status = 'pending') {
    const { rows } = await pool.query(
        `SELECT sr.id, sr.tenant_id, sr.plan_id, sr.amount, sr.evidence_path,
                sr.status, sr.note, sr.reviewed_by, sr.reviewed_at, sr.created_at,
                p.name AS plan_name, p.price AS plan_price,
                t.name AS tenant_name
         FROM subscription_requests sr
         JOIN plans   p ON p.id = sr.plan_id
         JOIN tenants t ON t.id = sr.tenant_id
         WHERE sr.status = $1
         ORDER BY sr.created_at ASC`,
        [status]
    );
    return rows;
}

async function getById(id, client = pool) {
    const { rows } = await client.query(`SELECT * FROM subscription_requests WHERE id = $1`, [id]);
    return rows[0] || null;
}

async function markReviewed(id, status, reviewed_by, note, client = pool) {
    const { rows } = await client.query(
        `UPDATE subscription_requests
         SET status = $2, reviewed_by = $3, note = COALESCE($4, note), reviewed_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, status, reviewed_by, note ?? null]
    );
    return rows[0] || null;
}

export default { createRequest, getPendingByTenant, listByStatus, getById, markReviewed };
