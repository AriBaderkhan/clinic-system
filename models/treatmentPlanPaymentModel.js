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

async function recalcTreatmentPlanTotals(treatmentPlanId, tenant_id, branch_id, client = pool) {
  const sumQuery = `
    SELECT COALESCE(SUM(amount), 0) AS total_paid
    FROM treatment_payments
    WHERE treatment_plan_id = $1
    AND tenant_id = $2
    AND branch_id = $3
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

export default { createTreatmentPlanPayment, recalcTreatmentPlanTotals };
