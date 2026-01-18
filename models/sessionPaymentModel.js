
import pool from '../db_connection.js';

async function createSessionPayment({ sessionId, amount, note, createdBy }, client = pool) {
  const query = `
    INSERT INTO session_payments (session_id, amount, note, created_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const values = [sessionId, amount, note, createdBy];
  const { rows } = await client.query(query, values);
  return rows[0];
}

async function recalcSessionTotals(sessionId, client = pool) {
  const sumQuery = `
    SELECT COALESCE(SUM(amount), 0)::bigint AS total_paid
    FROM session_payments
    WHERE session_id = $1
  `;
  const { rows: sumRows } = await client.query(sumQuery, [sessionId]);
  const totalPaid = Number(sumRows[0]?.total_paid || 0);

  const updateQuery = `
    UPDATE sessions
    SET
      total_paid = $2::bigint,
      is_paid = ($2::bigint > 0),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;

  const { rows } = await client.query(updateQuery, [sessionId, totalPaid]);
  return rows[0] || null;
}


async function upsertSessionPaymentBySessionId(
  { sessionId, amount, note = null, createdBy = null },
  client = pool
) {
  // 1️⃣ Try to UPDATE first
  const updateQuery = `
    UPDATE session_payments
    SET
      amount = $1,
      note = COALESCE($2, note),
      created_by = COALESCE($3, created_by)
    WHERE session_id = $4
    RETURNING *
  `;
  const updateResult = await client.query(updateQuery, [
    amount,
    note,
    createdBy,
    sessionId,
  ]);

  // If UPDATE found a row → done
  if (updateResult.rows.length > 0) {
    return updateResult.rows[0];
  }

  // 2️⃣ If no row exists → INSERT
  const insertQuery = `
    INSERT INTO session_payments (session_id, amount, note, created_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const insertResult = await client.query(insertQuery, [
    sessionId,
    amount,
    note,
    createdBy,
  ]);

  return insertResult.rows[0];
}



export default { createSessionPayment, recalcSessionTotals, upsertSessionPaymentBySessionId }