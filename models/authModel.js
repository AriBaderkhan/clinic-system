import pool from '../db_connection.js';

async function loginUser(email) {
        const query = `SELECT u.id, u.email, u.password,is_active, p.full_name,u.tenant_id
                FROM users u
                JOIN profiles p ON u.id = p.user_id
                WHERE LOWER(u.email) = LOWER($1)`;
        const value = [email];
        const { rows } = await pool.query(query, value);
        return rows[0] || null;

}

async function selectAUser(user_id, tenant_id) {
        const query = `SELECT u.id, u.email, u.password,is_active, p.full_name,u.tenant_id
                FROM users u
                JOIN profiles p ON u.id = p.user_id
                WHERE u.id = $1 AND u.tenant_id = $2`;
        const value = [user_id, tenant_id];
        const { rows } = await pool.query(query, value);
        return rows[0] || null;
}

// ── Account helpers (password reset / change, email change) ──
async function findByEmail(email) {
        const { rows } = await pool.query(`SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
        return rows[0] || null;
}

async function getCredById(user_id) {
        const { rows } = await pool.query(`SELECT id, email, password FROM users WHERE id = $1`, [user_id]);
        return rows[0] || null;
}

async function emailExists(email) {
        const { rows } = await pool.query(`SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`, [email]);
        return rows.length > 0;
}

async function updatePassword(user_id, password_hash) {
        await pool.query(`UPDATE users SET password = $2 WHERE id = $1`, [user_id, password_hash]);
}

async function updateEmail(user_id, email) {
        await pool.query(`UPDATE users SET email = $2 WHERE id = $1`, [user_id, email]);
}

export default { loginUser, selectAUser, findByEmail, getCredById, emailExists, updatePassword, updateEmail }