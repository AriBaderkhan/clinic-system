import pool from '../db_connection.js';

async function createPlan(body) {
    const { name, max_branches, max_users, price } = body;
    const query = `INSERT INTO plans (name, max_branches, max_users, price) VALUES ($1, $2, $3, $4) RETURNING *`;
    const result = await pool.query(query, [name, max_branches, max_users, price]);
    return result.rows[0];
}

async function getPlans() {
    const query = `SELECT * FROM plans`;
    const result = await pool.query(query);
    return result.rows;
}

async function getPlanById(id) {
    const query = `SELECT * FROM plans WHERE id = $1`;
    const result = await pool.query(query, [id]);
    return result.rows[0];
}

async function updatePlan(id, body) {
    const keys = Object.keys(body);
    const values = Object.values(body);

    if (keys.length === 0) throw new Error("No fields provided");

    const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(", ");

    const query = `UPDATE plans SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1}`;
    const allValues = [...values, id];
    const { rows } = await pool.query(query, allValues);
    return rows[0] || null;
}

async function deletePlan(id) {
    const query = `DELETE FROM plans WHERE id = $1`;
    const result = await pool.query(query, [id]);
    return result.rows[0];
}

export default { createPlan, getPlans, getPlanById, updatePlan, deletePlan };