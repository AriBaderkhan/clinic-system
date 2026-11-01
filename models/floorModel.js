import pool from '../db_connection.js';

async function getAll(tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, name, sort_order
      FROM floors
     WHERE tenant_id = $1 AND branch_id = $2 AND is_active = true
     ORDER BY sort_order ASC, name ASC`;
  const { rows } = await client.query(query, [tenant_id, branch_id]);
  return rows;
}

async function getById(id, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, name, sort_order
      FROM floors
     WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 AND is_active = true`;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}

async function getByName(name, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id
      FROM floors
     WHERE lower(name) = lower($1) AND tenant_id = $2 AND branch_id = $3 AND is_active = true`;
  const { rows } = await client.query(query, [name, tenant_id, branch_id]);
  return rows[0] || null;
}

async function create(name, sort_order, tenant_id, branch_id, client = pool) {
  const query = `
    INSERT INTO floors (name, sort_order, tenant_id, branch_id)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, sort_order`;
  const { rows } = await client.query(query, [name, sort_order, tenant_id, branch_id]);
  return rows[0] || null;
}

async function update(id, name, sort_order, tenant_id, branch_id, client = pool) {
  const query = `
    UPDATE floors
       SET name = $1, sort_order = $2
     WHERE id = $3 AND tenant_id = $4 AND branch_id = $5 AND is_active = true
     RETURNING id, name, sort_order`;
  const { rows } = await client.query(query, [name, sort_order, id, tenant_id, branch_id]);
  return rows[0] || null;
}

async function deactivate(id, tenant_id, branch_id, client = pool) {
  const query = `
    UPDATE floors
       SET is_active = false
     WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 AND is_active = true
     RETURNING id`;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}

async function countStaff(floor_id, tenant_id, branch_id, client = pool) {
  const query = `SELECT count(*) AS n FROM staff_floors WHERE floor_id = $1 AND tenant_id = $2 AND branch_id = $3`;
  const { rows } = await client.query(query, [floor_id, tenant_id, branch_id]);
  return Number(rows[0].n);
}

// the user's home floor in this branch (null = none)
async function getStaffFloorId(user_id, tenant_id, branch_id, client = pool) {
  const query = `SELECT floor_id FROM staff_floors WHERE user_id = $1 AND tenant_id = $2 AND branch_id = $3`;
  const { rows } = await client.query(query, [user_id, tenant_id, branch_id]);
  return rows[0] ? Number(rows[0].floor_id) : null;
}

// active staff of this branch with their role and home floor
async function getStaff(tenant_id, branch_id, client = pool) {
  const query = `
    SELECT * FROM (
      SELECT DISTINCT ON (u.id)
             u.id AS user_id, p.full_name, r.name AS role, sf.floor_id
        FROM user_branch_roles ubr
        JOIN users u    ON u.id = ubr.user_id AND u.is_active = true
        JOIN profiles p ON p.user_id = u.id
        JOIN roles r    ON r.id = ubr.role_id
        LEFT JOIN staff_floors sf ON sf.user_id = u.id AND sf.tenant_id = ubr.tenant_id AND sf.branch_id = ubr.branch_id
       WHERE ubr.tenant_id = $1 AND ubr.branch_id = $2 AND ubr.is_active = true
       ORDER BY u.id, r.id
    ) staff
    ORDER BY full_name ASC`;
  const { rows } = await client.query(query, [tenant_id, branch_id]);
  return rows;
}

async function isBranchStaff(user_id, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT 1 FROM user_branch_roles
     WHERE user_id = $1 AND tenant_id = $2 AND branch_id = $3 AND is_active = true
     LIMIT 1`;
  const { rows } = await client.query(query, [user_id, tenant_id, branch_id]);
  return rows.length > 0;
}

async function setStaffFloor(user_id, floor_id, tenant_id, branch_id, client = pool) {
  const query = `
    INSERT INTO staff_floors (user_id, branch_id, tenant_id, floor_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, branch_id) DO UPDATE SET floor_id = EXCLUDED.floor_id, updated_at = now()`;
  await client.query(query, [user_id, branch_id, tenant_id, floor_id]);
}

async function clearStaffFloor(user_id, tenant_id, branch_id, client = pool) {
  const query = `DELETE FROM staff_floors WHERE user_id = $1 AND tenant_id = $2 AND branch_id = $3`;
  await client.query(query, [user_id, tenant_id, branch_id]);
}

export default {
  getAll, getById, getByName, create, update, deactivate, countStaff,
  getStaffFloorId, getStaff, isBranchStaff, setStaffFloor, clearStaffFloor,
};
