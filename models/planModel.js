import pool from '../db_connection.js';

async function createPlan(body) {
    const { name, max_branches, max_users, price, yearly_price } = body;
    const query = `INSERT INTO plans (name, max_branches, max_users, price, yearly_price) VALUES ($1, $2, $3, $4, $5) RETURNING *`;
    const result = await pool.query(query, [name, max_branches, max_users, price, yearly_price]);
    return result.rows[0];
}

async function getPlans() {
    const query = `SELECT * FROM plans ORDER BY price ASC`;
    const result = await pool.query(query);
    return result.rows;
}

async function getPlanById(id) {
    const query = `SELECT * FROM plans WHERE id = $1`;
    const result = await pool.query(query, [id]);
    return result.rows[0];
}

// Only the known columns can change; a field left out keeps its current value.
async function updatePlan(id, body) {
    const { name, max_branches, max_users, price, yearly_price } = body;
    const query = `
        UPDATE plans SET
            name = COALESCE($1, name),
            max_branches = COALESCE($2, max_branches),
            max_users = COALESCE($3, max_users),
            price = COALESCE($4, price),
            yearly_price = COALESCE($5, yearly_price),
            updated_at = NOW()
        WHERE id = $6
        RETURNING *`;
    const values = [name ?? null, max_branches ?? null, max_users ?? null, price ?? null, yearly_price ?? null, id];
    const { rows } = await pool.query(query, values);
    return rows[0] || null;
}

async function deletePlan(id) {
    const query = `DELETE FROM plans WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
}

export default { createPlan, getPlans, getPlanById, updatePlan, deletePlan };
