
import pool from '../db_connection.js';

async function createSessionPayment({ sessionId, amount, note, createdBy }, tenant_id, branch_id, client = pool) {
  const query = `
    INSERT INTO session_payments (session_id, amount, note, created_by,tenant_id,branch_id)
    VALUES ($1, $2, $3, $4,$5,$6)
    RETURNING *
  `;
  const values = [sessionId, amount, note, createdBy, tenant_id, branch_id];
  const { rows } = await client.query(query, values);
  return rows[0];
}

async function recalcSessionTotals(sessionId, tenant_id, branch_id, client = pool) {
  const sumQuery = `
    SELECT COALESCE(SUM(amount), 0)::numeric AS total_paid
    FROM session_payments
    WHERE session_id = $1
    AND tenant_id = $2
    AND branch_id = $3
  `;
  const { rows: sumRows } = await client.query(sumQuery, [sessionId, tenant_id, branch_id]);
  const totalPaid = Number(sumRows[0]?.total_paid || 0);

  // A session is paid when paid money + any applied discount reaches the total
  // owed — NOT when any amount is received. A partial payment keeps is_paid =
  // false. Including discount_amount is what lets a discounted balance close.
  const updateQuery = `
    UPDATE sessions
    SET
      total_paid = $2::numeric,
      is_paid = ($2::numeric + COALESCE(discount_amount, 0) >= COALESCE(total, 0)),
      updated_at = NOW()
    WHERE id = $1
    AND tenant_id = $3
    AND branch_id = $4
    RETURNING *;
  `;

  const { rows } = await client.query(updateQuery, [sessionId, totalPaid, tenant_id, branch_id]);
  return rows[0] || null;
}


async function upsertSessionPaymentBySessionId(
  { sessionId, amount, note = null, createdBy = null },
  tenant_id, branch_id, client = pool
) {
  // 1️⃣ Try to UPDATE first
  const updateQuery = `
    UPDATE session_payments
    SET
      amount = $1,
      note = COALESCE($2, note),
      created_by = COALESCE($3, created_by)
    WHERE session_id = $4
    AND tenant_id = $5
    AND branch_id = $6
    RETURNING *
  `;
  const updateResult = await client.query(updateQuery, [
    amount,
    note,
    createdBy,
    sessionId,
    tenant_id,
    branch_id
  ]);

  // If UPDATE found a row → done
  if (updateResult.rows.length > 0) {
    return updateResult.rows[0];
  }

  // 2️⃣ If no row exists → INSERT
  const insertQuery = `
    INSERT INTO session_payments (session_id, amount, note, created_by,tenant_id,branch_id)
    VALUES ($1, $2, $3, $4,$5,$6)
    RETURNING *
  `;
  const insertResult = await client.query(insertQuery, [
    sessionId,
    amount,
    note,
    createdBy,
    tenant_id,
    branch_id
  ]);

  return insertResult.rows[0];
}




// Set the session's paid to an EXACT amount from the edit screen. Collapses the
// ledger to a single row so re-editing a session can never multiply the paid
// (the old upsert overwrote EVERY row with the full total, then recalc summed
// them). Deleting first also lets the paid be lowered, not only raised.
async function setSessionPaidExact({ sessionId, amount, note = null, createdBy = null }, tenant_id, branch_id, client = pool) {
  await client.query(
    `DELETE FROM session_payments WHERE session_id = $1 AND tenant_id = $2 AND branch_id = $3`,
    [sessionId, tenant_id, branch_id]
  );
  // amount has a CHECK (> 0): a zero/unpaid session simply keeps no payment row.
  if (Number(amount) <= 0) return null;
  const { rows } = await client.query(
    `INSERT INTO session_payments (session_id, amount, note, created_by, tenant_id, branch_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [sessionId, amount, note, createdBy, tenant_id, branch_id]
  );
  return rows[0] || null;
}

export default { createSessionPayment, recalcSessionTotals, upsertSessionPaymentBySessionId, setSessionPaidExact }