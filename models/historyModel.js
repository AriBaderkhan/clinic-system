import pool from '../db_connection.js'


// the branch's visit payments (one shared FROM, so the page and the totals always count the same payments)
const PAYMENTS_FROM = `
        FROM session_payments sp
        JOIN sessions s ON s.id=sp.session_id AND s.tenant_id = sp.tenant_id AND s.branch_id = sp.branch_id
        JOIN appointments a ON a.id=s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
        JOIN patients p ON p.id=a.patient_id AND p.tenant_id = a.tenant_id
        JOIN doctors d ON d.id=a.doctor_id AND d.tenant_id = a.tenant_id AND d.branch_id = a.branch_id
        JOIN profiles pr ON pr.user_id=d.id
        LEFT JOIN profiles pr2 ON pr2.user_id = sp.created_by   -- older payments have no "taken by"
        WHERE sp.tenant_id = $1
        AND sp.branch_id = $2`;

// one page, newest first
async function getPaymentsHistory(tenant_id, branch_id, limit, offset) {

  const query = `
    SELECT
        sp.session_id,
        sp.amount,
        sp.note,
        sp.currency_code,
        sp.created_at,

        s.id AS session_id,

        p.name  AS patient_name,
        p.phone      AS patient_phone,

        pr.full_name  AS doctor_name,
        pr2.full_name AS processed_by
        ${PAYMENTS_FROM}
        ORDER BY sp.created_at DESC, sp.id DESC
        LIMIT $3 OFFSET $4
    `;
  const { rows } = await pool.query(query, [tenant_id, branch_id, limit, offset]);
  return rows;
}

// totals over ALL the branch's payments (per currency) — the numbers on top of the page
async function getPaymentsTotals(tenant_id, branch_id) {
  const query = `
    SELECT sp.currency_code, COALESCE(SUM(sp.amount), 0) AS amount, COUNT(*)::int AS count
    ${PAYMENTS_FROM}
    GROUP BY sp.currency_code
    ORDER BY sp.currency_code`;
  const { rows } = await pool.query(query, [tenant_id, branch_id]);
  return rows;
}


async function getSessionDetails(session_id, tenant_id, branch_id) {
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

      sp.note AS payment_note,

      a.started_at  AS appointment_start_time,
      a.finished_at AS appointment_end_time,
      a.status      AS appointment_status,
      a.complaint   AS appointment_complaint,

      p.id    AS patient_id,
      p.name  AS patient_name,
      p.phone AS patient_phone,
      p.allergies        AS patient_allergies,
      p.blood_type       AS patient_blood_type,
      p.chronic_diseases AS patient_chronic_diseases,

      d.id         AS doctor_id,
      pr.full_name AS doctor_name,
      pr2.full_name AS processed_by
    FROM sessions s
    JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
    LEFT JOIN session_payments sp ON sp.session_id = s.id AND sp.tenant_id = s.tenant_id AND sp.branch_id = s.branch_id
    JOIN patients p     ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    JOIN doctors d      ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id AND d.branch_id = a.branch_id
    JOIN profiles pr    ON pr.user_id = d.id
    JOIN profiles pr2   ON pr2.user_id = s.created_by
    WHERE s.id = $1
    AND s.tenant_id = $2
    AND s.branch_id = $3
  `;
  const value = [session_id, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows[0] || null;
}

export default { getPaymentsHistory, getSessionDetails, getPaymentsTotals }