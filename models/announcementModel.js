import pool from '../db_connection.js';

async function create({ title, body, image_path, video_url, target_plan_id, target_roles, created_by }) {
    const { rows } = await pool.query(
        `INSERT INTO announcements (title, body, image_path, video_url, target_plan_id, target_roles, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [title, body ?? null, image_path ?? null, video_url ?? null, target_plan_id ?? null, target_roles ?? null, created_by ?? null]
    );
    return rows[0];
}

// Admin list, optional plan filter (planId null = show all).
async function listAdmin(planId) {
    const params = [];
    let where = `WHERE a.is_active = TRUE`;
    if (planId) { params.push(planId); where += ` AND a.target_plan_id = $${params.length}`; }
    const { rows } = await pool.query(
        `SELECT a.*, p.name AS plan_name
         FROM announcements a
         LEFT JOIN plans p ON p.id = a.target_plan_id
         ${where}
         ORDER BY a.created_at DESC`,
        params
    );
    return rows;
}

async function getById(id) {
    const { rows } = await pool.query(`SELECT * FROM announcements WHERE id = $1`, [id]);
    return rows[0] || null;
}

// Soft delete (keeps read history intact).
async function remove(id) {
    await pool.query(`UPDATE announcements SET is_active = FALSE WHERE id = $1`, [id]);
}

// What a user should see: matches their plan (or all) AND their role (or all).
async function listForUser(user_id, plan_id, role) {
    const { rows } = await pool.query(
        `SELECT a.id, a.title, a.body, a.image_path, a.video_url, a.target_plan_id, a.target_roles, a.created_at,
                (r.id IS NOT NULL) AS read
         FROM announcements a
         LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = $1
         WHERE a.is_active = TRUE
           AND (a.target_plan_id IS NULL OR a.target_plan_id = $2)
           AND (a.target_roles IS NULL OR $3 = ANY(a.target_roles))
         ORDER BY a.created_at DESC`,
        [user_id, plan_id, role]
    );
    return rows;
}

async function markRead(announcement_id, user_id) {
    await pool.query(
        `INSERT INTO announcement_reads (announcement_id, user_id)
         VALUES ($1, $2) ON CONFLICT (announcement_id, user_id) DO NOTHING`,
        [announcement_id, user_id]
    );
}

export default { create, listAdmin, getById, remove, listForUser, markRead };
