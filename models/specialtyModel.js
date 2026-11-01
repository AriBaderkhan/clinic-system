import pool from '../db_connection.js';

async function getAll(tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, name, uses_teeth
      FROM specialties
     WHERE tenant_id = $1 AND branch_id = $2 AND is_active = true
     ORDER BY name ASC`;
  const { rows } = await client.query(query, [tenant_id, branch_id]);
  return rows;
}

async function getById(id, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, name, uses_teeth
      FROM specialties
     WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 AND is_active = true`;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}

async function getByName(name, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id
      FROM specialties
     WHERE lower(name) = lower($1) AND tenant_id = $2 AND branch_id = $3 AND is_active = true`;
  const { rows } = await client.query(query, [name, tenant_id, branch_id]);
  return rows[0] || null;
}

async function create(name, uses_teeth, tenant_id, branch_id, client = pool) {
  const query = `
    INSERT INTO specialties (name, uses_teeth, tenant_id, branch_id)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, uses_teeth`;
  const { rows } = await client.query(query, [name, uses_teeth, tenant_id, branch_id]);
  return rows[0] || null;
}

async function update(id, name, uses_teeth, tenant_id, branch_id, client = pool) {
  const query = `
    UPDATE specialties
       SET name = $1, uses_teeth = $2
     WHERE id = $3 AND tenant_id = $4 AND branch_id = $5 AND is_active = true
     RETURNING id, name, uses_teeth`;
  const { rows } = await client.query(query, [name, uses_teeth, id, tenant_id, branch_id]);
  return rows[0] || null;
}

async function deactivate(id, tenant_id, branch_id, client = pool) {
  const query = `
    UPDATE specialties
       SET is_active = false
     WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 AND is_active = true
     RETURNING id`;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}

// how many doctors / active treatments still point at this specialty
async function usageCounts(id, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT
      (SELECT count(*) FROM doctors d
        WHERE d.specialty_id = $1 AND d.tenant_id = $2 AND d.branch_id = $3) AS doctors,
      (SELECT count(*) FROM work_catalog w
        WHERE w.specialty_id = $1 AND w.tenant_id = $2 AND w.branch_id = $3 AND w.is_active = true) AS works`;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0];
}

export default { getAll, getById, getByName, create, update, deactivate, usageCounts };
