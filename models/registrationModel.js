import pool from '../db_connection.js';

async function createRequest({ tenant_name, manager_name, email, phone, address, password_hash, plan_id, evidence_path }) {
    const { rows } = await pool.query(
        `INSERT INTO tenant_registration_requests
            (tenant_name, manager_name, email, phone, address, password_hash, plan_id, evidence_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [tenant_name, manager_name, email, phone ?? null, address ?? null, password_hash, plan_id, evidence_path ?? null]
    );
    return rows[0];
}

// Only one open signup per email at a time.
async function findPendingByEmail(email) {
    const { rows } = await pool.query(
        `SELECT * FROM tenant_registration_requests WHERE email = $1 AND status = 'pending' LIMIT 1`,
        [email]
    );
    return rows[0] || null;
}

// Email already belongs to a real account?
async function userEmailExists(email) {
    const { rows } = await pool.query(`SELECT 1 FROM users WHERE email = $1 LIMIT 1`, [email]);
    return rows.length > 0;
}

// Platform-admin queue: requests with tenant + plan names.
async function listByStatus(status = 'pending') {
    const { rows } = await pool.query(
        `SELECT r.id, r.tenant_name, r.manager_name, r.email, r.phone, r.address,
                r.plan_id, r.evidence_path, r.status, r.note, r.created_at,
                p.name AS plan_name, p.price AS plan_price
         FROM tenant_registration_requests r
         JOIN plans p ON p.id = r.plan_id
         WHERE r.status = $1
         ORDER BY r.created_at ASC`,
        [status]
    );
    return rows;
}

async function getById(id, client = pool) {
    const { rows } = await client.query(`SELECT * FROM tenant_registration_requests WHERE id = $1`, [id]);
    return rows[0] || null;
}

async function markReviewed(id, status, reviewed_by, note, client = pool) {
    const { rows } = await client.query(
        `UPDATE tenant_registration_requests
         SET status = $2, reviewed_by = $3, note = COALESCE($4, note), reviewed_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, status, reviewed_by, note ?? null]
    );
    return rows[0] || null;
}

export default { createRequest, findPendingByEmail, userEmailExists, listByStatus, getById, markReviewed };
