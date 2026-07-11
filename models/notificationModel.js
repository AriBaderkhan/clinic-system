import pool from '../db_connection.js';

// Insert one row per recipient user. Returns the created rows (with ids) so the
// caller can emit them straight over the socket.
async function createMany(rows, client = pool) {
    if (!rows.length) return [];

    const values = [];
    const params = [];
    rows.forEach((r, i) => {
        const b = i * 6;
        params.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`);
        values.push(r.tenant_id, r.branch_id, r.user_id, r.type, r.message, r.appointment_id ?? null);
    });

    const query = `
        INSERT INTO notifications (tenant_id, branch_id, user_id, type, message, appointment_id)
        VALUES ${params.join(',')}
        RETURNING id, type, message, appointment_id, is_read, created_at, user_id`;
    const { rows: out } = await client.query(query, values);
    return out;
}

// Recent notifications for one user (newest first).
async function listForUser(user_id, tenant_id, branch_id, client = pool) {
    const query = `
        SELECT id, type, message, appointment_id, is_read, created_at
        FROM notifications
        WHERE user_id = $1 AND tenant_id = $2 AND branch_id = $3
        ORDER BY created_at DESC
        LIMIT 30`;
    const { rows } = await client.query(query, [user_id, tenant_id, branch_id]);
    return rows;
}

// Mark one as read, scoped to the owner so nobody can touch another user's row.
async function markRead(id, user_id, tenant_id, branch_id, client = pool) {
    const query = `
        UPDATE notifications
        SET is_read = true
        WHERE id = $1 AND user_id = $2 AND tenant_id = $3 AND branch_id = $4
        RETURNING id`;
    const { rows } = await client.query(query, [id, user_id, tenant_id, branch_id]);
    return rows[0] || null;
}

// Active user ids for any of the given roles in a branch (recipients for
// role-wide events). DISTINCT because a user could hold more than one role.
async function getUserIdsByRoles(roles, tenant_id, branch_id, client = pool) {
    const query = `
        SELECT DISTINCT ubr.user_id
        FROM user_branch_roles ubr
        JOIN roles r ON r.id = ubr.role_id
        WHERE r.name = ANY($1) AND ubr.tenant_id = $2 AND ubr.branch_id = $3 AND ubr.is_active = true`;
    const { rows } = await client.query(query, [roles, tenant_id, branch_id]);
    return rows.map((x) => x.user_id);
}

export default { createMany, listForUser, markRead, getUserIdsByRoles };
