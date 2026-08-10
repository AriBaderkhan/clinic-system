import pool from '../db_connection.js';

async function createDiscount(name, type, value, tenant_id, branch_id, client = pool) {
  const query = `
    INSERT INTO discounts (name, type, value, tenant_id, branch_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, name, type, value, is_active
  `;
  const { rows } = await client.query(query, [name, type, value, tenant_id, branch_id]);
  return rows[0] || null;
}

// All active discounts for the branch (settings list + pay dropdown).
async function getDiscounts(tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, name, type, value, is_active
    FROM discounts
    WHERE tenant_id = $1 AND branch_id = $2 AND is_active = true
    ORDER BY name ASC
  `;
  const { rows } = await client.query(query, [tenant_id, branch_id]);
  return rows;
}

async function getDiscountById(id, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, name, type, value, is_active
    FROM discounts
    WHERE id = $1 AND tenant_id = $2 AND branch_id = $3
  `;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}

async function updateDiscount(id, fields, tenant_id, branch_id, client = pool) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
  const query = `
    UPDATE discounts
       SET ${setClause}, updated_at = NOW()
     WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} AND branch_id = $${keys.length + 3}
     RETURNING id, name, type, value, is_active
  `;
  const { rows } = await client.query(query, [...values, id, tenant_id, branch_id]);
  return rows[0] || null;
}

// Soft-delete so sessions that already used this discount keep their record.
async function deleteDiscount(id, tenant_id, branch_id, client = pool) {
  const query = `
    UPDATE discounts SET is_active = false, updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2 AND branch_id = $3
    RETURNING id
  `;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}

export default { createDiscount, getDiscounts, getDiscountById, updateDiscount, deleteDiscount };
