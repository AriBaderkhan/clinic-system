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
export default { loginUser, selectAUser }