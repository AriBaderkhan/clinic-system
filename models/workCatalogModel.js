import pool from '../db_connection.js';


async function getWorkById(id,client = pool) {
  const query = `
    SELECT id, code, name, min_price, allow_installments, min_installment_amount
    FROM work_catalog
    WHERE id = $1
  `;
  const { rows } = await client.query(query, [id]);
  return rows[0] || null;
}

async function getWorkByType(type, client = pool) {
  const query = `
    SELECT id, code, name, min_price, allow_installments, min_installment_amount
    FROM work_catalog
    WHERE code = $1
  `;
  const { rows } = await pool.query(query, [type]);
  return rows[0] || null;
}

export default {
  getWorkById,
  getWorkByType
};