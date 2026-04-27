import pool from "../db_connection.js";
import appError from "../utils/appError.js";


async function findUserById(user_id, tenant_id) {
    const query = `
    SELECT
    ubr.id,
    ubr.user_id,
    ubr.branch_id,
    ubr.tenant_id,
    ubr.is_active,
    ubr.role_id,
    b.name AS branch_name,
    r.name AS role_name
    FROM user_branch_roles ubr
    JOIN roles r ON ubr.role_id = r.id
    JOIN branches b ON ubr.branch_id = b.id
    WHERE ubr.user_id = $1 AND ubr.tenant_id = $2 AND ubr.is_active = true`;
    const values = [user_id, tenant_id];
    const { rows } = await pool.query(query, values);
    if (rows.length === 0) return null;
    return rows;
}


async function findUserByIdForMiddleware(user_id, tenant_id, branch_id) {
    const query = `
    SELECT
    user_id,
    branch_id,
    tenant_id,
    is_active
    FROM user_branch_roles
    WHERE user_id = $1 AND tenant_id = $2 AND branch_id = $3`;
    const values = [user_id, tenant_id, branch_id];
    const { rows } = await pool.query(query, values);
    if (rows.length === 0) return null;
    if (rows.length > 1) throw appError('BRANCH_SELECTION_REQUIRED', 'Select a branch', 409);
    return rows[0]
}


async function createRowUBR(user_id, branch_id, tenant_id, role_id) {
    const query = `
    INSERT INTO user_branch_roles (user_id, branch_id, tenant_id, role_id)
    VALUES ($1, $2, $3, $4)
    RETURNING id`;
    const values = [user_id, branch_id, tenant_id, role_id];
    const { rows } = await pool.query(query, values);
    return rows[0]
}

async function findUserByAll(user_id, tenant_id, branch_id) {
    const query = `
    SELECT
    ubr.id,
    ubr.user_id,
    ubr.branch_id,
    ubr.tenant_id,
    ubr.is_active,
    ubr.role_id,
    b.name AS branch_name,
    r.name AS role_name
    FROM user_branch_roles ubr
    JOIN roles r ON ubr.role_id = r.id
    JOIN branches b ON ubr.branch_id = b.id
    WHERE ubr.user_id = $1 AND ubr.tenant_id = $2 AND ubr.branch_id = $3`;
    const values = [user_id, tenant_id, branch_id];
    const { rows } = await pool.query(query, values);
    if (rows.length === 0) return null;
    return rows[0];
}
export default { findUserById, findUserByIdForMiddleware, createRowUBR, findUserByAll }
