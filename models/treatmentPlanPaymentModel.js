import pool from "../db_connection.js";

async function createTreatmentPlanPayment(
  { treatmentPlanId, sessionId, amount, note, createdBy },
  tenant_id, branch_id, client = pool
) {
  const query = `
    INSERT INTO treatment_payments
      (treatment_plan_id, session_id, amount, note, created_by,tenant_id,branch_id)
    VALUES ($1, $2, $3, $4, $5,$6,$7)
    RETURNING *
  `;
  const values = [
    treatmentPlanId,
    sessionId,
    amount,
    note,
    createdBy,
    tenant_id,
    branch_id
  ];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

// Plan paid = sum of its LIVE payments (deleted ones never count).
async function recalcTreatmentPlanTotals(treatmentPlanId, tenant_id, branch_id, client = pool) {
  const sumQuery = `
    SELECT COALESCE(SUM(amount), 0) AS total_paid
    FROM treatment_payments
    WHERE treatment_plan_id = $1
    AND tenant_id = $2
    AND branch_id = $3
    AND is_deleted = false
  `;
  const { rows: sumRows } = await client.query(sumQuery, [treatmentPlanId, tenant_id, branch_id]);
  const totalPaid = Number(sumRows[0].total_paid);

  const updateQuery = `
    UPDATE treatment_plans
    SET
      total_paid = $2,
      is_paid = (agreed_total <= $2),
      updated_at = NOW()
    WHERE id = $1
    AND tenant_id = $3
    AND branch_id = $4
    RETURNING *
  `;
  const { rows } = await client.query(updateQuery, [treatmentPlanId, totalPaid, tenant_id, branch_id]);
  return rows[0] || null;
}

// Live plan payments taken in one session, with the plan type, for the edit screen.
async function listForSession(sessionId, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `SELECT tpp.id, tpp.treatment_plan_id, tp.type AS plan_type, tpp.amount, tpp.note,
            tpp.currency_code, tpp.created_at, pr.full_name AS created_by_name
       FROM treatment_payments tpp
       JOIN treatment_plans tp ON tp.id = tpp.treatment_plan_id
       LEFT JOIN profiles pr ON pr.user_id = tpp.created_by
      WHERE tpp.session_id = $1 AND tpp.tenant_id = $2 AND tpp.branch_id = $3 AND tpp.is_deleted = false
      ORDER BY tpp.created_at ASC, tpp.id ASC`,
    [sessionId, tenant_id, branch_id]
  );
  return rows;
}

async function getByIdForUpdate(paymentId, sessionId, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `SELECT * FROM treatment_payments
      WHERE id = $1 AND session_id = $2 AND tenant_id = $3 AND branch_id = $4 AND is_deleted = false
      FOR UPDATE`,
    [paymentId, sessionId, tenant_id, branch_id]
  );
  return rows[0] || null;
}

// Change one plan payment's amount/note; created_at is kept (report month stays).
async function updatePayment(paymentId, amount, note, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `UPDATE treatment_payments SET amount = $2, note = $3
      WHERE id = $1 AND tenant_id = $4 AND branch_id = $5 AND is_deleted = false
      RETURNING *`,
    [paymentId, amount, note, tenant_id, branch_id]
  );
  return rows[0] || null;
}

// Remove one plan payment (soft: reports already skip is_deleted rows).
async function voidPayment(paymentId, deletedBy, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `UPDATE treatment_payments SET is_deleted = true, deleted_at = NOW(), deleted_by = $2
      WHERE id = $1 AND tenant_id = $3 AND branch_id = $4 AND is_deleted = false
      RETURNING *`,
    [paymentId, deletedBy, tenant_id, branch_id]
  );
  return rows[0] || null;
}

// Whole visit deleted: void every plan payment taken in it. Returns the rows so
// the caller can recalculate the plans they belonged to.
async function voidAllForSession(sessionId, deletedBy, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `UPDATE treatment_payments SET is_deleted = true, deleted_at = NOW(), deleted_by = $2
      WHERE session_id = $1 AND tenant_id = $3 AND branch_id = $4 AND is_deleted = false
      RETURNING *`,
    [sessionId, deletedBy, tenant_id, branch_id]
  );
  return rows;
}

// A plan work moved to another plan: this visit's payments for the old plan follow it.
async function movePaymentsInSession(sessionId, fromPlanId, toPlanId, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `UPDATE treatment_payments SET treatment_plan_id = $3
      WHERE session_id = $1 AND treatment_plan_id = $2 AND tenant_id = $4 AND branch_id = $5 AND is_deleted = false
      RETURNING *`,
    [sessionId, fromPlanId, toPlanId, tenant_id, branch_id]
  );
  return rows;
}

async function getLiveForPlanInSessionForUpdate(sessionId, planId, tenant_id, branch_id, client) {
  const { rows } = await client.query(
    `SELECT * FROM treatment_payments
      WHERE session_id = $1 AND treatment_plan_id = $2 AND tenant_id = $3 AND branch_id = $4 AND is_deleted = false
      ORDER BY created_at ASC FOR UPDATE`,
    [sessionId, planId, tenant_id, branch_id]
  );
  return rows;
}

async function countLiveForPlanInSession(sessionId, planId, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM treatment_payments
      WHERE session_id = $1 AND treatment_plan_id = $2 AND tenant_id = $3 AND branch_id = $4 AND is_deleted = false`,
    [sessionId, planId, tenant_id, branch_id]
  );
  return rows[0].n;
}

export default {
  createTreatmentPlanPayment, recalcTreatmentPlanTotals, listForSession, getByIdForUpdate,
  updatePayment, voidPayment, voidAllForSession, movePaymentsInSession, countLiveForPlanInSession,
  getLiveForPlanInSessionForUpdate,
};
