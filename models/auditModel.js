import pool from '../db_connection.js';

// Append-only: insert one audit row.
async function record(entry) {
    const {
        tenant_id, branch_id, actor_id, actor_name, actor_role,
        action, entity_type, entity_id, method, path, status_code, request_id, ip,
    } = entry;

    const { rows } = await pool.query(
        `INSERT INTO audit_logs
            (tenant_id, branch_id, actor_id, actor_name, actor_role,
             action, entity_type, entity_id, method, path, status_code, request_id, ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
            tenant_id, branch_id ?? null, actor_id ?? null, actor_name ?? null, actor_role ?? null,
            action, entity_type ?? null, entity_id ?? null, method ?? null, path ?? null,
            status_code ?? null, request_id ?? null, ip ?? null,
        ]
    );
    return rows[0];
}

// Tenant-scoped, newest first. Optional filters: q (actor name), from/to (dates).
async function list({ tenant_id, q, from, to, limit, offset }) {
    const where = ['tenant_id = $1'];
    const params = [tenant_id];

    if (q) { params.push(`%${q}%`); where.push(`actor_name ILIKE $${params.length}`); }
    if (from) { params.push(from); where.push(`created_at >= $${params.length}`); }
    // 'to' is a date — include the whole day by going up to the next midnight.
    if (to) { params.push(to); where.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`); }

    const whereSql = where.join(' AND ');

    const totalRes = await pool.query(`SELECT COUNT(*) FROM audit_logs WHERE ${whereSql}`, params);

    params.push(limit); const limitIdx = params.length;
    params.push(offset); const offsetIdx = params.length;
    const { rows } = await pool.query(
        `SELECT * FROM audit_logs
         WHERE ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
    );

    return { rows, total: Number(totalRes.rows[0].count) };
}

export default { record, list };
