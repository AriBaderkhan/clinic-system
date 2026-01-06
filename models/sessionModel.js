import pool from '../db_connection.js';


async function createSession(appointment_id, next_plan, notes, created_by, client = pool) {
  const query = `INSERT INTO sessions (appointment_id,next_plan,notes,created_by) VALUES ($1,$2,$3,$4) RETURNING *`;
  const values = [appointment_id, next_plan, notes, created_by];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}



// add these 
async function getAllNormalSessions() {
  const query = `
  SELECT 
      s.id AS session_id,
      s.appointment_id,
      s.total,
      s.total_paid,
      s.is_paid,
      s.created_at,

      a.finished_at AS appointment_end_time,

      p.id    AS patient_id,
      p.name  AS patient_name,

      d.id         AS doctor_id,
      pr.full_name AS doctor_name
  FROM sessions s
  JOIN appointments a ON a.id = s.appointment_id
  JOIN patients p     ON p.id = a.patient_id
  JOIN doctors d      ON d.id = a.doctor_id
  JOIN profiles pr    ON pr.user_id = d.id
  WHERE EXISTS (
    SELECT 1
    FROM session_works sw
    WHERE sw.session_id = s.id
     AND sw.treatment_plan_id IS NULL
  )
  ORDER BY
    CASE WHEN s.is_paid = false THEN 0 ELSE 1 END,  -- unpaid first
    s.created_at DESC;`;
  const { rows } = await pool.query(query);
  return rows;
}

async function getNormalSession(session_id, client = pool) {
  const query = `
  SELECT 
      s.id AS session_id,
      s.appointment_id,
      s.min_total,
      s.total,
      s.total_paid,
      s.is_paid,
      s.next_plan,
      s.notes,
      s.created_at,

      a.started_at  AS appointment_start_time,
      a.finished_at AS appointment_end_time,
      a.status      AS appointment_status,

      p.id    AS patient_id,
      p.name  AS patient_name,
      p.phone AS patient_phone,

      d.id         AS doctor_id,
      pr.full_name AS doctor_name,
      pr2.full_name AS processed_by
    FROM sessions s
    JOIN appointments a ON a.id = s.appointment_id
    JOIN patients p     ON p.id = a.patient_id
    JOIN doctors d      ON d.id = a.doctor_id
    JOIN profiles pr    ON pr.user_id = d.id
    JOIN profiles pr2   ON pr2.user_id = s.created_by
    WHERE s.id = $1
  `;
  const value = [session_id]
  const { rows } = await client.query(query, value);
  return rows[0] || null;
}

async function getSession(session_id) {
  const query = `SELECT * FROM sessions WHERE id=$1`;
  const value = [session_id];
  const { rows } = await pool.query(query, value);
  return rows[0] || null;
}

async function updateSession(sessionID, fields, updatedBy) {
  const allowedFields = ['complaint', 'diagnosis', 'next_plan', 'notes'];

  const keys = Object.keys(fields).filter((key) => allowedFields.includes(key));


  if (keys.length === 0) throw new Error("No fields provided");

  const values = keys.map((key) => fields[key]);

  keys.push("updated_by");
  values.push(updatedBy);

  const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(", ");

  const query = `UPDATE sessions SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *;`;
  const allValues = [...values, sessionID];
  const { rows } = await pool.query(query, allValues)
  return rows[0] || null;

}

async function deleteSession(sessionID) {
  const query = `DELETE FROM sessions WHERE id=$1 RETURNING *`;
  const value = [sessionID];
  const { rows } = await pool.query(query, value);
  return rows[0] || null;
}

async function deleteSessionWorksBySiD(session_id, client = pool) {
  const query = `DELETE FROM session_works sw WHERE sw.session_id=$1 `;
  const value = [session_id];
  const { rows } = await client.query(query, value);
  return rows[0] || null;
}

async function createSessionWork({
  sessionId,
  workId,
  quantity,
  toothNumber,
  minUnitPrice,
  unitPrice,
  totalMinPrice,
  totalPrice,
  treatmentPlanId
}, client = pool) {
  const query = `
    INSERT INTO session_works (
      session_id,
      work_id,
      quantity,
      tooth_number,
      min_unit_price,
      unit_price,
      total_min_price,
      total_price,
      treatment_plan_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *;
  `;

  const values = [
    sessionId,
    workId,
    quantity,
    toothNumber,
    minUnitPrice,
    unitPrice,
    totalMinPrice,
    totalPrice,
    treatmentPlanId
  ];

  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

async function updateSessionTotal({ min_total, total, total_paid, is_paid, sessionId }, client = pool) {
  const query = `UPDATE sessions SET min_total=$1, total=$2, total_paid=$3, is_paid=$4 WHERE id=$5 RETURNING *`;
  const values = [min_total, total, total_paid, is_paid, sessionId];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

async function getAllUnPaidSessions() {
  const query = `
    /* UNPAID_SESSIONS_V2 */
    SELECT 
      s.id AS session_id,
      s.appointment_id,
      s.min_total,
      s.total,
      s.total_paid,
      s.is_paid,
      s.next_plan,
      s.notes,

      a.started_at AS appointment_start_time,
      a.finished_at AS appointment_end_time,
      a.status AS appointment_status,

      p.id AS patient_id,
      p.name AS patient_name,
      p.phone AS patient_phone,

      d.id AS doctor_id,
      pr.full_name AS doctor_name
    FROM sessions s
    JOIN appointments a ON a.id = s.appointment_id
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    JOIN profiles pr ON d.id = pr.user_id
    WHERE a.status = 'completed'
      AND (
        -- (A) normal session unpaid
        s.total > COALESCE(s.total_paid, 0)

        OR

        -- (B) plan installment for THIS session missing
        EXISTS (
          SELECT 1
          FROM session_works sw
          JOIN treatment_plans tp ON tp.id = sw.treatment_plan_id
          WHERE sw.session_id = s.id
            AND sw.treatment_plan_id IS NOT NULL

            -- plan overall still has remaining (optional but ok)
            AND tp.agreed_total > COALESCE((
              SELECT SUM(tpp2.amount)
              FROM treatment_payments tpp2
              WHERE tpp2.treatment_plan_id = tp.id
            ), 0)

            -- but THIS session hasn't paid at least 50,000 for THIS plan
            AND COALESCE((
              SELECT SUM(tpp.amount)
              FROM treatment_payments tpp
              WHERE tpp.session_id = s.id
                AND tpp.treatment_plan_id = tp.id
            ), 0) < 50000
        )
      )
    ORDER BY a.started_at DESC
  `;
  const { rows } = await pool.query(query);
  return rows;
}

async function getWorksForSessions(session_id) {
  // if (!sessionIds.length) return [];

  const query = `
    SELECT
      sw.session_id,
      sw.work_id,
      sw.tooth_number,
      sw.quantity,
      sw.unit_price,
      sw.total_price,
      wc.name AS work_name
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id
    WHERE sw.session_id = ANY($1::int[])
      AND sw.treatment_plan_id IS NULL
    ORDER BY sw.session_id, wc.name, sw.tooth_number
  `;

  const value = [session_id];
  const { rows } = await pool.query(query, value);
  return rows;
}

async function getWorksForNormalSession(session_id) {


  const query = `
    SELECT
      s.id AS session_id,

      sw.session_id,
      sw.work_id,
      sw.tooth_number,
      sw.quantity,
      sw.unit_price,
      sw.total_price,
      wc.name AS work_name
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id
    JOIN sessions s ON s.id=sw.session_id
    WHERE sw.session_id = $1
      AND sw.treatment_plan_id IS NULL
    ORDER BY sw.session_id, wc.name, sw.tooth_number
  `;

  const value = [session_id];
  const { rows } = await pool.query(query, value);
  return rows;
}

async function getSessionWithAppointment(sessionId) {
  const query = `
    SELECT
      s.id,
      s.min_total,
      s.total,
      s.total_paid,
      s.is_paid,
      a.status AS appointment_status,
      a.patient_id,
    FROM sessions s
    JOIN appointments a ON a.id = s.appointment_id
    WHERE s.id = $1
  `;
  const { rows } = await pool.query(query, [sessionId]);
  return rows[0] || null;
}

async function getSessionWithAppointmentForUpdate(sessionId, client = pool) {
  const query = `
    SELECT
      s.id AS session_id,
      s.min_total,
      s.total,
      s.total_paid,
      s.is_paid,
      a.status AS appointment_status,
      a.patient_id
    FROM sessions s
    JOIN appointments a ON a.id = s.appointment_id
    WHERE s.id = $1
    FOR UPDATE
  `;
  const { rows } = await client.query(query, [sessionId]);
  return rows[0] || null;
}

async function getTreatmentPlansForSession(sessionId, client = pool) {
  const query = `
    SELECT DISTINCT tp.*
    FROM session_works sw
    JOIN treatment_plans tp ON tp.id = sw.treatment_plan_id
    WHERE sw.session_id = $1
      AND sw.treatment_plan_id IS NOT NULL
    ORDER BY tp.created_at DESC
  `;
  const { rows } = await client.query(query, [sessionId]);
  return rows || [];
}

async function getSessionPaymentContext(sessionId, client = pool) {
  const query = `
    SELECT
      s.id AS session_id,
      s.appointment_id,
      s.min_total,
      s.total,
      s.total_paid,
      s.is_paid,
      a.status AS appointment_status,
      a.patient_id,
      a.doctor_id
    FROM sessions s
    JOIN appointments a ON a.id = s.appointment_id
    WHERE s.id = $1
  `;
  const { rows } = await client.query(query, [sessionId]);
  return rows[0] || null;
}

async function getTreatmentPlansForSessions(sessionIds) {
  const query = `
    SELECT DISTINCT
      sw.session_id,
      tp.id,
      tp.type,
      tp.agreed_total,
      tp.total_paid,
      tp.is_paid,
      tp.is_completed,
      tp.status
    FROM session_works sw
    JOIN treatment_plans tp ON tp.id = sw.treatment_plan_id
    WHERE sw.session_id = ANY($1)
      AND sw.treatment_plan_id IS NOT NULL
  `;

  const { rows } = await pool.query(query, [sessionIds]);
  return rows;
}

// sessionModel.js
async function hasPlanDue(sessionId, client = pool) {
  const q = `
    SELECT EXISTS (
      SELECT 1
      FROM session_works sw
      JOIN treatment_plans tp ON tp.id = sw.treatment_plan_id
      WHERE sw.session_id = $1
        AND tp.agreed_total > COALESCE(tp.total_paid, 0)
    ) AS has_plan_due;
  `;
  const { rows } = await client.query(q, [sessionId]);
  return rows[0].has_plan_due === true;
}



async function updateSessionNotesFields(session_id, notess, client = pool) {
  const keys = Object.keys(notess);
  const values = Object.values(notess);

  const setClause = keys
    .map((key, idx) => `${key} = $${idx + 1}`)
    .join(', ');

  const query = `
    UPDATE sessions
       SET ${setClause},
           updated_at = NOW()
     WHERE id = $${keys.length + 1}
     RETURNING *;
  `;

  const allValues = [...values, session_id];
  const { rows } = await client.query(query, allValues);
  return rows[0] || null;
}

export default {
  createSession, getAllNormalSessions, getNormalSession, getSession, updateSession, deleteSession, deleteSessionWorksBySiD, createSessionWork, updateSessionTotal, getAllUnPaidSessions, getWorksForNormalSession, getWorksForSessions,
  getSessionWithAppointment, getTreatmentPlansForSession, getSessionPaymentContext, getSessionWithAppointmentForUpdate,
  getTreatmentPlansForSessions, hasPlanDue, updateSessionNotesFields
}