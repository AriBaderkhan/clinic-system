import pool from '../db_connection.js';




async function getActivePlan(patientId, type,client = pool) {
  const query = ` SELECT * 
                    FROM treatment_plans
                    WHERE patient_id = $1
                        AND type = $2
                        AND status = 'active'
                    ORDER BY created_at DESC 
                    LIMIT 1`;
  const values = [patientId, type];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

async function createPlan({ patientId, type, agreedTotal, createdBy },client = pool) {
  const query = ` INSERT INTO treatment_plans
                    (patient_id, type, agreed_total, created_by)
                    VALUES ($1, $2, $3, $4) RETURNING *`;
  const values = [patientId, type, agreedTotal, createdBy];
  const { rows } = await client.query(query, values);
  return rows[0] || null;

}


async function getTreatmentPlanByIdForUpdate(planId, client = pool) {
  const query = `
    SELECT *
    FROM treatment_plans
    WHERE id = $1
    FOR UPDATE
  `;
  const { rows } = await client.query(query, [planId]);
  return rows[0] || null;
}

async function markCompleted(planId,client = pool) {
  const query = `
    UPDATE treatment_plans
    SET
      is_completed = true,
      status = 'completed',
      updated_at = NOW()
    WHERE id = $1 RETURNING *;

  `;
  const { rows } = await client.query(query, [planId]);
  return rows[0] || null;
}

async function getSessionsForTp(tpId) {
  const query = `
    SELECT
  s.id AS session_id,
  s.next_plan,
  s.notes,
  a.finished_at,

  COALESCE(SUM(tpp.amount), 0) AS paid_for_this_plan_in_this_session
FROM sessions s
JOIN appointments a
  ON a.id = s.appointment_id

-- relation discovery (ONLY to link session ↔ plan)
JOIN (
  SELECT DISTINCT session_id
  FROM session_works
  WHERE treatment_plan_id = $1
) rel
  ON rel.session_id = s.id

-- money table (safe to sum now)
LEFT JOIN treatment_payments tpp
  ON tpp.session_id = s.id
 AND tpp.treatment_plan_id = $1
GROUP BY
  s.id, s.next_plan, s.notes, a.finished_at
ORDER BY a.finished_at DESC NULLS LAST;`;
  const value = [tpId];
  const { rows } = await pool.query(query, value);
  return rows;
}
export default { getActivePlan, createPlan, getTreatmentPlanByIdForUpdate, markCompleted, getSessionsForTp }



