
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
    SELECT COALESCE(SUM(amount), 0) AS total_paid
    FROM session_payments
    WHERE session_id = $1
  `;
  const { rows: sumRows } = await client.query(sumQuery, [sessionId]);
  const totalPaid = Number(sumRows[0].total_paid);

  const updateQuery = `
    UPDATE sessions
    SET
      total_paid = $2,
      is_paid = (total <= $2),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const { rows } = await client.query(updateQuery, [sessionId, totalPaid]);
  return rows[0];
}


export default { createSessionPayment, recalcSessionTotals }