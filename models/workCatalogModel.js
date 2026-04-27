import pool from '../db_connection.js';


async function getWorkById(id, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, code, name, min_price, allow_installments, min_installment_amount
    FROM work_catalog
    WHERE id = $1
    AND tenant_id = $2
    AND branch_id = $3
  `;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}

async function getWorkByType(type, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, code, name, min_price, allow_installments, min_installment_amount
    FROM work_catalog
    WHERE code = $1
    AND tenant_id = $2
    AND branch_id = $3
  `;
  const { rows } = await client.query(query, [type, tenant_id, branch_id]);
  return rows[0] || null;
}

export default {
  getWorkById,
  getWorkByType
};