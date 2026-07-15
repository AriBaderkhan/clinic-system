import pool from '../db_connection.js';


async function createSession(appointment_id, next_plan, notes, created_by, tenant_id, branch_id, client = pool) {
  const query = `INSERT INTO sessions (appointment_id,next_plan,notes,created_by,tenant_id,branch_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`;
  const values = [appointment_id, next_plan, notes, created_by, tenant_id, branch_id];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}



// add these 
async function getAllNormalSessions({ from, to, search, page, limit }, tenant_id, branch_id) {
  const baseQuery = `
  SELECT
      s.id AS session_id,
      s.appointment_id,
      s.total,
      s.total_paid,
      s.is_paid,
      s.currency_code,
      s.created_at,

      a.finished_at AS appointment_end_time,

      p.id    AS patient_id,
      p.name  AS patient_name,

      d.id         AS doctor_id,
      pr.full_name AS doctor_name,

      pay.payment_note,

      EXISTS (
        SELECT 1 FROM session_works sw
        WHERE sw.session_id = s.id
          AND sw.tenant_id = s.tenant_id
          AND sw.branch_id = s.branch_id
          AND sw.treatment_plan_id IS NULL
      ) AS has_normal_works,

      COUNT(*) OVER() AS total_count
  FROM sessions s
  JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
  JOIN patients p     ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
  JOIN doctors d      ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id AND d.branch_id = a.branch_id
  JOIN profiles pr    ON pr.user_id = d.id
  LEFT JOIN LATERAL (
    SELECT string_agg(NULLIF(sp.note, ''), ' | ' ORDER BY sp.created_at) AS payment_note
    FROM session_payments sp
    WHERE sp.session_id = s.id
      AND sp.tenant_id = s.tenant_id
      AND sp.branch_id = s.branch_id
  ) pay ON true
  WHERE s.tenant_id = $1
  AND s.branch_id = $2`;

  const where = [];
  const values = [tenant_id, branch_id];
  let idx = 3;

  if (from) {
    where.push(`s.created_at >= $${idx}`);
    values.push(from);
    idx++;
  }

  if (to) {
    where.push(`s.created_at < $${idx}`);
    values.push(to);
    idx++;
  }

  if (search) {
    where.push(
      `(p.name ILIKE $${idx} OR pr.full_name ILIKE $${idx})`
    );
    values.push(`%${search}%`);
    idx++;
  }

  // Show ALL sessions in the Sessions tab — including plan-only sessions.
  // (Treatment-plan money still lives in its own tab; plan-only rows are
  // badged on the frontend via has_normal_works.)

  let query = baseQuery;
  if (where.length > 0) {
    query += ` AND ` + where.join(" AND ");
  }

  query += `
  ORDER BY
    CASE WHEN s.is_paid = false THEN 0 ELSE 1 END,
    s.created_at DESC
  `;

  const safePage = Math.max(1, page || 1);
  const safeLimit = limit || 20;
  const offset = (safePage - 1) * safeLimit;
  query += ` LIMIT $${idx} OFFSET $${idx + 1}`;
  values.push(safeLimit, offset);

  const { rows } = await pool.query(query, values);
  const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
  return { rows: rows.map(({ total_count, ...rest }) => rest), total };
}

async function getNormalSession(session_id, tenant_id, branch_id, client = pool) {
  const query = `
  SELECT 
      s.id AS session_id,
      s.appointment_id,
      s.min_total,
      s.total,
      s.total_paid,
      s.is_paid,
      s.currency_code,
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
      pr2.full_name AS processed_by,

      pay.payment_note
    FROM sessions s
    JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
    JOIN patients p     ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    JOIN doctors d      ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id AND d.branch_id = a.branch_id
    JOIN profiles pr    ON pr.user_id = d.id
    JOIN profiles pr2   ON pr2.user_id = s.created_by
    LEFT JOIN LATERAL (
      SELECT string_agg(NULLIF(sp.note, ''), ' | ' ORDER BY sp.created_at) AS payment_note
      FROM session_payments sp
      WHERE sp.session_id = s.id
        AND sp.tenant_id = s.tenant_id
        AND sp.branch_id = s.branch_id
    ) pay ON true
    WHERE s.id = $1
    AND s.tenant_id = $2
    AND s.branch_id = $3
  `;
  const value = [session_id, tenant_id, branch_id];
  const { rows } = await client.query(query, value);
  return rows[0] || null;
}

async function getSession(session_id, tenant_id, branch_id, client = pool) {
  const query = `SELECT * FROM sessions WHERE id=$1 AND tenant_id=$2 AND branch_id=$3`;
  const value = [session_id, tenant_id, branch_id];
  const { rows } = await client.query(query, value);
  return rows[0] || null;
}

async function updateSession(sessionID, fields, updatedBy, tenant_id, branch_id) {
  const allowedFields = ['next_plan', 'notes'];

  const keys = Object.keys(fields).filter((key) => allowedFields.includes(key));


  if (keys.length === 0) throw new Error("No fields provided");

  const values = keys.map((key) => fields[key]);

  keys.push("updated_by");
  values.push(updatedBy);

  const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(", ");

  const query = `UPDATE sessions SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} AND tenant_id=$${keys.length + 2} AND branch_id=$${keys.length + 3} RETURNING *;`;
  const allValues = [...values, sessionID, tenant_id, branch_id];
  const { rows } = await pool.query(query, allValues)
  return rows[0] || null;

}

async function deleteSession(sessionID, tenant_id, branch_id) {
  const query = `DELETE FROM sessions WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 RETURNING *`;
  const value = [sessionID, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows[0] || null;
}

// Deletes ONLY the normal works of a session (treatment_plan_id IS NULL).
// Treatment-plan works are intentionally preserved — they belong to the plan
// and are never part of the normal-works edit/recalc.
async function deleteSessionWorksBySiD(session_id, tenant_id, branch_id, client = pool) {
  const query = `DELETE FROM session_works sw WHERE sw.session_id=$1 AND sw.tenant_id=$2 AND sw.branch_id=$3 AND sw.treatment_plan_id IS NULL RETURNING *`;
  const value = [session_id, tenant_id, branch_id];
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
}, tenant_id, branch_id, client = pool) {
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
      treatment_plan_id,
      tenant_id,
      branch_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
    treatmentPlanId,
    tenant_id,
    branch_id
  ];

  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

async function bulkCreateSessionWorks(works, tenant_id, branch_id, client = pool) {
  const values = [];
  const placeholders = works.map((w, i) => {
    const b = i * 11;
    values.push(w.sessionId, w.workId, w.quantity, w.toothNumber, w.minUnitPrice, w.unitPrice, w.totalMinPrice, w.totalPrice, w.treatmentPlanId, tenant_id, branch_id);
    return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11})`;
  });

  const query = `
    INSERT INTO session_works (
      session_id, work_id, quantity, tooth_number,
      min_unit_price, unit_price, total_min_price, total_price,
      treatment_plan_id, tenant_id, branch_id
    )
    VALUES ${placeholders.join(', ')}
    RETURNING *
  `;

  const { rows } = await client.query(query, values);
  return rows;
}

async function updateSessionTotal({ min_total, total, total_paid, is_paid, sessionId }, tenant_id, branch_id, client = pool) {
  const query = `UPDATE sessions SET min_total=$1, total=$2, total_paid=$3, is_paid=$4 WHERE id=$5 AND tenant_id=$6 AND branch_id=$7 RETURNING *`;
  const values = [min_total, total, total_paid, is_paid, sessionId, tenant_id, branch_id];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

async function getAllUnPaidSessions(tenant_id, branch_id, { limit, q } = {}) {
  const values = [tenant_id, branch_id];
  let idx = 3;
  let whereExtra = '';

  if (q) {
    whereExtra = ` AND p.name ILIKE $${idx}`;
    values.push(`%${q}%`);
    idx++;
  }

  const limitClause = limit ? ` LIMIT $${idx}` : '';
  if (limit) values.push(limit);

  const query = `
    WITH plan_totals AS (
      SELECT treatment_plan_id, SUM(amount) AS paid
      FROM treatment_payments
      WHERE tenant_id = $1 AND branch_id = $2
      GROUP BY treatment_plan_id
    ),
    session_plan_totals AS (
      SELECT session_id, treatment_plan_id, SUM(amount) AS paid
      FROM treatment_payments
      WHERE tenant_id = $1 AND branch_id = $2
      GROUP BY session_id, treatment_plan_id
    ),
    sessions_with_plan_due AS (
      SELECT DISTINCT sw.session_id
      FROM session_works sw
      JOIN treatment_plans tp ON tp.id = sw.treatment_plan_id AND tp.tenant_id = sw.tenant_id AND tp.branch_id = sw.branch_id
      LEFT JOIN plan_totals pt ON pt.treatment_plan_id = tp.id
      LEFT JOIN session_plan_totals spt ON spt.session_id = sw.session_id AND spt.treatment_plan_id = tp.id
      WHERE sw.tenant_id = $1
        AND sw.branch_id = $2
        AND sw.treatment_plan_id IS NOT NULL
        AND tp.agreed_total > COALESCE(pt.paid, 0)
        AND COALESCE(spt.paid, 0) = 0
    )
    SELECT
      COUNT(*) OVER() AS total_count,
      s.id AS session_id,
      s.appointment_id,
      s.min_total,
      s.total,
      s.total_paid,
      s.is_paid,
      s.currency_code,
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
    JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
    JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    JOIN doctors d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id AND d.branch_id = a.branch_id
    JOIN profiles pr ON d.id = pr.user_id
    WHERE a.status = 'completed'
      AND s.tenant_id = $1
      AND s.branch_id = $2
      AND (
        (COALESCE(s.total, 0) > 0 AND COALESCE(s.total_paid, 0) = 0)
        OR s.id IN (SELECT session_id FROM sessions_with_plan_due)
      )${whereExtra}
    ORDER BY a.started_at DESC${limitClause}
  `;

  const { rows } = await pool.query(query, values);
  const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
  return { rows: rows.map(({ total_count, ...rest }) => rest), total };
}

async function getWorksForSessions(session_ids, tenant_id, branch_id) {
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
    JOIN work_catalog wc ON wc.id = sw.work_id AND wc.tenant_id = sw.tenant_id AND wc.branch_id = sw.branch_id
    WHERE sw.session_id = ANY($1::int[])
      AND sw.tenant_id = $2
      AND sw.branch_id = $3
      AND sw.treatment_plan_id IS NULL
    ORDER BY sw.session_id, wc.name, sw.tooth_number
  `;

  const value = [session_ids, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows;
}

// ALL works done in a session — normal AND treatment-plan works together (for display).
// (getWorksForSessions stays normal-only because it feeds the unpaid/payment flow.)
async function getAllWorksForSession(session_id, tenant_id, branch_id) {
  const query = `
    SELECT
      sw.id AS session_work_id,
      sw.session_id,
      sw.work_id,
      sw.tooth_number,
      sw.quantity,
      sw.unit_price,
      sw.total_price,
      sw.treatment_plan_id,
      tp.type AS plan_type,
      wc.name AS work_name
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id AND wc.tenant_id = sw.tenant_id AND wc.branch_id = sw.branch_id
    LEFT JOIN treatment_plans tp ON tp.id = sw.treatment_plan_id AND tp.tenant_id = sw.tenant_id AND tp.branch_id = sw.branch_id
    WHERE sw.session_id = $1
      AND sw.tenant_id = $2
      AND sw.branch_id = $3
    ORDER BY wc.name, sw.tooth_number
  `;
  const { rows } = await pool.query(query, [session_id, tenant_id, branch_id]);
  return rows;
}

async function getWorksForNormalSession(session_id, tenant_id, branch_id) {


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
    JOIN work_catalog wc ON wc.id = sw.work_id AND wc.tenant_id = sw.tenant_id AND wc.branch_id = sw.branch_id
    WHERE sw.session_id = $1
      AND sw.tenant_id = $2
      AND sw.branch_id = $3
      AND sw.treatment_plan_id IS NULL
    ORDER BY wc.name, sw.tooth_number
  `;

  const value = [session_id, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows;
}

async function getSessionWithAppointment(sessionId, tenant_id, branch_id) {
  const query = `
    SELECT
      s.id,
      s.min_total,
      s.total,
      s.total_paid,
      s.is_paid,
      a.status AS appointment_status,
      a.patient_id
    FROM sessions s
    JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
    WHERE s.id = $1
      AND s.tenant_id = $2
      AND s.branch_id = $3
  `;
  const { rows } = await pool.query(query, [sessionId, tenant_id, branch_id]);
  return rows[0] || null;
}

async function getSessionWithAppointmentForUpdate(sessionId, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT
      s.id AS session_id,
      s.min_total,
      s.total,
      s.total_paid,
      s.is_paid,
      a.status AS appointment_status,
      a.patient_id,
      EXISTS (
        SELECT 1
        FROM session_works sw
        JOIN treatment_plans tp ON tp.id = sw.treatment_plan_id AND tp.tenant_id = sw.tenant_id AND tp.branch_id = sw.branch_id
        WHERE sw.session_id = s.id
          AND sw.tenant_id = s.tenant_id
          AND sw.branch_id = s.branch_id
          AND tp.agreed_total > COALESCE(tp.total_paid, 0)
      ) AS has_plan_due
    FROM sessions s
    JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
    WHERE s.id = $1
      AND s.tenant_id = $2
      AND s.branch_id = $3
    FOR UPDATE
  `;
  const { rows } = await client.query(query, [sessionId, tenant_id, branch_id]);
  return rows[0] || null;
}

async function getTreatmentPlansForSession(sessionId, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT DISTINCT tp.*
    FROM session_works sw
    JOIN treatment_plans tp ON tp.id = sw.treatment_plan_id AND tp.tenant_id = sw.tenant_id AND tp.branch_id = sw.branch_id
    WHERE sw.session_id = $1
      AND sw.treatment_plan_id IS NOT NULL
      AND sw.tenant_id = $2
      AND sw.branch_id = $3
    ORDER BY tp.created_at DESC
  `;
  const { rows } = await client.query(query, [sessionId, tenant_id, branch_id]);
  return rows || [];
}

async function getSessionPaymentContext(sessionId, tenant_id, branch_id, client = pool) {
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
    JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
    WHERE s.id = $1
      AND s.tenant_id = $2
      AND s.branch_id = $3
  `;
  const { rows } = await client.query(query, [sessionId, tenant_id, branch_id]);
  return rows[0] || null;
}

async function getTreatmentPlansForSessions(sessionIds, tenant_id, branch_id) {
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
    JOIN treatment_plans tp ON tp.id = sw.treatment_plan_id AND tp.tenant_id = sw.tenant_id AND tp.branch_id = sw.branch_id
    WHERE sw.session_id = ANY($1)
      AND sw.treatment_plan_id IS NOT NULL
      AND sw.tenant_id = $2
      AND sw.branch_id = $3
  `;

  const { rows } = await pool.query(query, [sessionIds, tenant_id, branch_id]);
  return rows;
}

// sessionModel.js
async function hasPlanDue(sessionId, tenant_id, branch_id, client = pool) {
  const q = `
    SELECT EXISTS (
      SELECT 1
      FROM session_works sw
      JOIN treatment_plans tp ON tp.id = sw.treatment_plan_id AND tp.tenant_id = sw.tenant_id AND tp.branch_id = sw.branch_id
      WHERE sw.session_id = $1
        AND sw.tenant_id = $2
        AND sw.branch_id = $3
        AND tp.agreed_total > COALESCE(tp.total_paid, 0)
    ) AS has_plan_due;
  `;
  const { rows } = await client.query(q, [sessionId, tenant_id, branch_id]);
  return rows[0].has_plan_due === true;
}



// In-place tooth change for a SINGLE treatment-plan work row. Money-neutral and
// plan-neutral: it only updates the tooth, and only for rows that belong to a
// plan (treatment_plan_id IS NOT NULL) within this session/tenant/branch.
async function updatePlanWorkTooth(sessionWorkId, tooth_number, session_id, tenant_id, branch_id, client = pool) {
  const query = `
    UPDATE session_works
       SET tooth_number = $1
     WHERE id = $2
       AND session_id = $3
       AND tenant_id = $4
       AND branch_id = $5
       AND treatment_plan_id IS NOT NULL
     RETURNING *
  `;
  const { rows } = await client.query(query, [tooth_number, sessionWorkId, session_id, tenant_id, branch_id]);
  return rows[0] || null;
}

async function updateSessionNotesFields(session_id, notess, tenant_id, branch_id, client = pool) {
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
       AND tenant_id = $${keys.length + 2}
       AND branch_id = $${keys.length + 3}
     RETURNING *;
  `;

  const allValues = [...values, session_id, tenant_id, branch_id];
  const { rows } = await client.query(query, allValues);
  return rows[0] || null;
}

export default {
  createSession, getAllNormalSessions, getNormalSession, getSession, updateSession, deleteSession, deleteSessionWorksBySiD, createSessionWork, bulkCreateSessionWorks, updateSessionTotal, getAllUnPaidSessions, getWorksForNormalSession, getWorksForSessions, getAllWorksForSession,
  getSessionWithAppointment, getTreatmentPlansForSession, getSessionPaymentContext, getSessionWithAppointmentForUpdate,
  getTreatmentPlansForSessions, hasPlanDue, updateSessionNotesFields, updatePlanWorkTooth
}