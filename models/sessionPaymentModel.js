
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
  // A session reception closed as done ("settled") stays paid after any edit.
  const updateQuery = `
    UPDATE sessions
    SET
      total_paid = $2::numeric,
      is_paid = (is_settled OR $2::numeric + COALESCE(discount_amount, 0) >= COALESCE(total, 0)),
      updated_at = NOW()
    WHERE id = $1
    AND tenant_id = $3
    AND branch_id = $4
    RETURNING *;
  `;

  const { rows } = await client.query(updateQuery, [sessionId, totalPaid, tenant_id, branch_id]);
  return rows[0] || null;
}

// Every payment of a session (oldest first) with who took it, for the edit screen.
async function listForSession(sessionId, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `SELECT sp.id, sp.amount, sp.note, sp.currency_code, sp.created_at, pr.full_name AS created_by_name
       FROM session_payments sp
       LEFT JOIN profiles pr ON pr.user_id = sp.created_by
      WHERE sp.session_id = $1 AND sp.tenant_id = $2 AND sp.branch_id = $3
      ORDER BY sp.created_at ASC, sp.id ASC`,
    [sessionId, tenant_id, branch_id]
  );
  return rows;
}

async function getByIdForUpdate(paymentId, sessionId, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `SELECT * FROM session_payments
      WHERE id = $1 AND session_id = $2 AND tenant_id = $3 AND branch_id = $4
      FOR UPDATE`,
    [paymentId, sessionId, tenant_id, branch_id]
  );
  return rows[0] || null;
}

// Change one payment's amount/note. created_at is kept, so the money stays in the
// month it was really received (reports group by created_at).
async function updatePayment(paymentId, amount, note, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `UPDATE session_payments
        SET amount = $2, note = $3
      WHERE id = $1 AND tenant_id = $4 AND branch_id = $5
      RETURNING *`,
    [paymentId, amount, note, tenant_id, branch_id]
  );
  return rows[0] || null;
}

async function deletePayment(paymentId, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `DELETE FROM session_payments WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 RETURNING *`,
    [paymentId, tenant_id, branch_id]
  );
  return rows[0] || null;
}

// Used when a whole visit is deleted: its normal payments leave the reports.
async function deleteAllForSession(sessionId, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `DELETE FROM session_payments WHERE session_id = $1 AND tenant_id = $2 AND branch_id = $3 RETURNING *`,
    [sessionId, tenant_id, branch_id]
  );
  return rows;
}

export default {
  createSessionPayment, recalcSessionTotals, listForSession, getByIdForUpdate,
  updatePayment, deletePayment, deleteAllForSession,
}
