import pool from '../db_connection.js';

async function insertMany(rows, tenant_id, branch_id, client = pool) {
  if (!rows || rows.length === 0) return [];

  const values = [];
  const placeholders = rows.map((r, i) => {
    const b = i * 6;
    values.push(r.session_id, tenant_id, branch_id, r.storage_path, r.mime_type, r.uploaded_by);
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`;
  });

  const query = `
    INSERT INTO session_images (session_id, tenant_id, branch_id, storage_path, mime_type, uploaded_by)
    VALUES ${placeholders.join(', ')}
    RETURNING *
  `;
  const { rows: out } = await client.query(query, values);
  return out;
}

async function getBySessionId(session_id, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT * FROM session_images
    WHERE session_id = $1 AND tenant_id = $2 AND branch_id = $3
    ORDER BY created_at ASC, id ASC
  `;
  const { rows } = await client.query(query, [session_id, tenant_id, branch_id]);
  return rows;
}

async function getById(id, tenant_id, branch_id, client = pool) {
  const query = `SELECT * FROM session_images WHERE id = $1 AND tenant_id = $2 AND branch_id = $3`;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}

async function deleteById(id, tenant_id, branch_id, client = pool) {
  const query = `DELETE FROM session_images WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 RETURNING *`;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}

export default { insertMany, getBySessionId, getById, deleteById };
