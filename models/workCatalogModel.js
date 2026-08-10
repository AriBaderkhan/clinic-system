import pool from '../db_connection.js';

async function createWork(code, name, min_price, allow_installments, min_installment_amount, tenant_id, branch_id, is_active, is_plan, is_whole_mouth, client = pool) {
  const query = `
    INSERT INTO work_catalog (code, name, min_price, allow_installments, min_installment_amount, tenant_id, branch_id, is_active, is_plan, is_whole_mouth)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id,code,name
  `;
  const values = [code, name, min_price, allow_installments, min_installment_amount, tenant_id, branch_id, is_active, is_plan, is_whole_mouth];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}
    
async function getWorks(tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, code, name, min_price, allow_installments, min_installment_amount, is_active, is_plan, is_whole_mouth
    FROM work_catalog
    WHERE tenant_id = $1
    AND branch_id = $2
    AND is_active = true
    ORDER BY name ASC
  `;
  const { rows } = await client.query(query, [tenant_id, branch_id]);
  return rows;
}

async function getWorkById(id, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, code, name, min_price, allow_installments, min_installment_amount, is_active, is_plan, is_whole_mouth
    FROM work_catalog
    WHERE id = $1
    AND tenant_id = $2
    AND branch_id = $3
  `;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}

async function getWorksByIds(ids, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, code, name, min_price, allow_installments, min_installment_amount, is_active, is_plan, is_whole_mouth
    FROM work_catalog
    WHERE id = ANY($1::int[])
    AND tenant_id = $2
    AND branch_id = $3
  `;
  const { rows } = await client.query(query, [ids, tenant_id, branch_id]);
  return rows;
}

async function getWorkByType(type, tenant_id, branch_id, client = pool) {
  // Only ACTIVE works count as duplicates — a soft-deleted code can be re-added.
  const query = `
    SELECT id, code, name, min_price, allow_installments, min_installment_amount
    FROM work_catalog
    WHERE code = $1
    AND tenant_id = $2
    AND branch_id = $3
    AND is_active = true
  `;
  const { rows } = await client.query(query, [type, tenant_id, branch_id]);
  return rows[0] || null;
}

async function updateWork(workId, fields, tenant_id, branch_id) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);

  const setClause = keys
    .map((key, idx) => `${key} = $${idx + 1}`)
    .join(', ');

  const query = `
    UPDATE work_catalog
       SET ${setClause}
     WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} AND branch_id = $${keys.length + 3}
     RETURNING *;
  `;

  const allValues = [...values, workId, tenant_id, branch_id];
  const { rows } = await pool.query(query, allValues);
  return rows[0] || null;
}


async function deleteWork(id, tenant_id, branch_id, client = pool) {
  const query = `
    UPDATE work_catalog
    SET is_active = false
    WHERE id = $1
    AND tenant_id = $2
    AND branch_id = $3
    RETURNING id
  `;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}
export default {
  createWork,
  getWorks,
  getWorkById,
  getWorksByIds,
  getWorkByType,
  updateWork,
  deleteWork
};