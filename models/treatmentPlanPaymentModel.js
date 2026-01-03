import pool from "../db_connection.js";

async function createTreatmentPlanPayment(
  { treatmentPlanId, sessionId, amount, note, createdBy },
  client = pool
) {
  const query = `
    INSERT INTO treatment_payments
      (treatment_plan_id, session_id, amount, note, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const values = [
    treatmentPlanId,
    sessionId,
    amount,
    note,
    createdBy,
  ];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

async function recalcTreatmentPlanTotals(treatmentPlanId, client = pool) {
  const sumQuery = `
    SELECT COALESCE(SUM(amount), 0) AS total_paid
    FROM treatment_payments
    WHERE treatment_plan_id = $1
  `;
  const { rows: sumRows } = await client.query(sumQuery, [treatmentPlanId]);
  const totalPaid = Number(sumRows[0].total_paid);

  const updateQuery = `
    UPDATE treatment_plans
    SET
      total_paid = $2,
      is_paid = (agreed_total <= $2),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const { rows } = await client.query(updateQuery, [treatmentPlanId, totalPaid]);
  return rows[0] || null;
}

export default { createTreatmentPlanPayment, recalcTreatmentPlanTotals };
