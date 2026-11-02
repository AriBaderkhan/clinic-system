import pool from '../db_connection.js'

// One branch's overview. Every query is limited to (tenant_id, branch_id).
// Money is always grouped by currency_code — currencies are never added together.

// New patients registered here today, patients registered before today who have
// an appointment here today, and the active team of this branch.
async function getCounts(todayStart, todayEnd, tenant_id, branch_id) {
  const query = `
    SELECT
      (SELECT COUNT(*)::int FROM patients
        WHERE tenant_id = $3 AND branch_id = $4 AND created_at >= $1 AND created_at < $2) AS new_patients,
      (SELECT COUNT(DISTINCT a.patient_id)::int FROM appointments a
         JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
        WHERE a.tenant_id = $3 AND a.branch_id = $4 AND a.is_deleted = false
          AND a.scheduled_start >= $1 AND a.scheduled_start < $2 AND p.created_at < $1) AS returning_patients,
      (SELECT COUNT(DISTINCT ubr.user_id)::int FROM user_branch_roles ubr
         JOIN users u ON u.id = ubr.user_id AND u.is_active = true
        WHERE ubr.tenant_id = $3 AND ubr.branch_id = $4 AND ubr.is_active = true) AS team_members`;
  const { rows } = await pool.query(query, [todayStart, todayEnd, tenant_id, branch_id]);
  return rows[0];
}

// Today's appointments of this branch with patient and doctor names.
async function getTodayAppointments(todayStart, todayEnd, tenant_id, branch_id) {
  const query = `
    SELECT a.id, p.name AS patient_name, pr.full_name AS doctor_name, a.scheduled_start, a.status
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    LEFT JOIN profiles pr ON pr.user_id = a.doctor_id
    WHERE a.tenant_id = $3 AND a.branch_id = $4 AND a.is_deleted = false
      AND a.scheduled_start >= $1 AND a.scheduled_start < $2
    ORDER BY a.scheduled_start ASC`;
  const { rows } = await pool.query(query, [todayStart, todayEnd, tenant_id, branch_id]);
  return rows;
}

// Money in (visit payments + plan payments) per currency for three windows:
// this month so far, last month up to the same day and hour, and all of last month.
async function getRevenueWindows({ monthStart, now, lastMonthStart, lastMonthSameEnd }, tenant_id, branch_id) {
  const query = `
    WITH pay AS (
      SELECT currency_code, amount, created_at FROM session_payments
       WHERE tenant_id = $5 AND branch_id = $6 AND created_at >= $3 AND created_at < $2
      UNION ALL
      SELECT currency_code, amount, created_at FROM treatment_payments
       WHERE tenant_id = $5 AND branch_id = $6 AND is_deleted = false AND created_at >= $3 AND created_at < $2
    )
    SELECT currency_code,
      COALESCE(SUM(amount) FILTER (WHERE created_at >= $1), 0)                     AS this_month,
      COALESCE(SUM(amount) FILTER (WHERE created_at < $1 AND created_at < $4), 0)  AS last_month_to_date,
      COALESCE(SUM(amount) FILTER (WHERE created_at < $1), 0)                      AS last_month
    FROM pay
    GROUP BY currency_code
    ORDER BY currency_code`;
  const { rows } = await pool.query(query, [monthStart, now, lastMonthStart, lastMonthSameEnd, tenant_id, branch_id]);
  return rows;
}

// What patients still owe this branch, per currency:
//   visits = finished visits not paid and not settled (the unpaid list's rule)
//   plans  = live treatment plans whose agreed total is not fully paid yet
async function getUnpaid(tenant_id, branch_id) {
  const query = `
    SELECT currency_code, kind, COUNT(*)::int AS count, COALESCE(SUM(owed), 0) AS total
    FROM (
      SELECT s.currency_code, 'visits' AS kind,
             GREATEST(COALESCE(s.total, 0) - COALESCE(s.total_paid, 0) - COALESCE(s.discount_amount, 0), 0) AS owed
      FROM sessions s
      JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
      WHERE s.tenant_id = $1 AND s.branch_id = $2 AND s.is_deleted = false
        AND a.status = 'completed' AND s.is_paid = false AND COALESCE(s.total, 0) > 0
      UNION ALL
      SELECT tp.currency_code, 'plans' AS kind,
             GREATEST(tp.agreed_total - COALESCE(tp.total_paid, 0), 0) AS owed
      FROM treatment_plans tp
      WHERE tp.tenant_id = $1 AND tp.branch_id = $2 AND tp.is_deleted = false
        AND tp.agreed_total > COALESCE(tp.total_paid, 0)
    ) d
    GROUP BY currency_code, kind
    ORDER BY currency_code, kind`;
  const { rows } = await pool.query(query, [tenant_id, branch_id]);
  return rows;
}

// Each doctor of this branch this month: finished visits, patients, works done.
// Doctors with an active place here, plus anyone who had appointments here this month.
async function getDoctorWork(monthStart, now, tenant_id, branch_id) {
  const query = `
    SELECT d.id AS doctor_id, pr.full_name AS doctor_name,
      COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'completed')::int          AS visits_done,
      COUNT(DISTINCT a.patient_id) FILTER (WHERE a.status = 'completed')::int  AS patients,
      COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('cancelled', 'no_show'))::int AS missed,
      COALESCE((SELECT SUM(COALESCE(sw.quantity, 1))
                  FROM session_works sw
                  JOIN sessions s ON s.id = sw.session_id AND s.tenant_id = sw.tenant_id AND s.branch_id = sw.branch_id
                  JOIN appointments a2 ON a2.id = s.appointment_id AND a2.tenant_id = s.tenant_id AND a2.branch_id = s.branch_id
                 WHERE sw.tenant_id = $3 AND sw.branch_id = $4 AND sw.is_deleted = false AND s.is_deleted = false
                   AND a2.doctor_id = d.id AND s.created_at >= $1 AND s.created_at < $2), 0)::int AS works_done
    FROM doctors d
    LEFT JOIN profiles pr ON pr.user_id = d.id
    LEFT JOIN appointments a ON a.doctor_id = d.id AND a.tenant_id = d.tenant_id AND a.branch_id = d.branch_id
                            AND a.is_deleted = false AND a.scheduled_start >= $1 AND a.scheduled_start < $2
    WHERE d.tenant_id = $3 AND d.branch_id = $4
      AND (a.id IS NOT NULL OR EXISTS (
            SELECT 1 FROM user_branch_roles ubr
             WHERE ubr.user_id = d.id AND ubr.tenant_id = d.tenant_id AND ubr.branch_id = d.branch_id AND ubr.is_active = true))
    GROUP BY d.id, pr.full_name
    ORDER BY visits_done DESC, pr.full_name`;
  const { rows } = await pool.query(query, [monthStart, now, tenant_id, branch_id]);
  return rows;
}

// Money in per doctor this month, per currency. A payment belongs to the doctor
// of the visit it was paid on; plan payments with no visit are not counted here.
async function getDoctorIncome(monthStart, now, tenant_id, branch_id) {
  const query = `
    WITH pay AS (
      SELECT s.appointment_id, sp.currency_code, sp.amount
      FROM session_payments sp
      JOIN sessions s ON s.id = sp.session_id AND s.tenant_id = sp.tenant_id AND s.branch_id = sp.branch_id
      WHERE sp.tenant_id = $3 AND sp.branch_id = $4 AND sp.created_at >= $1 AND sp.created_at < $2
      UNION ALL
      SELECT s.appointment_id, tp.currency_code, tp.amount
      FROM treatment_payments tp
      JOIN sessions s ON s.id = tp.session_id AND s.tenant_id = tp.tenant_id AND s.branch_id = tp.branch_id
      WHERE tp.tenant_id = $3 AND tp.branch_id = $4 AND tp.is_deleted = false
        AND tp.created_at >= $1 AND tp.created_at < $2
    )
    SELECT a.doctor_id, pay.currency_code, COALESCE(SUM(pay.amount), 0) AS total
    FROM pay
    JOIN appointments a ON a.id = pay.appointment_id AND a.tenant_id = $3 AND a.branch_id = $4
    GROUP BY a.doctor_id, pay.currency_code`;
  const { rows } = await pool.query(query, [monthStart, now, tenant_id, branch_id]);
  return rows;
}

// When the branch is busy: appointments (not cancelled) from `since` until now,
// by weekday (0 = Sunday) and hour, in clinic time.
async function getBusyTimes(since, now, tenant_id, branch_id) {
  const query = `
    SELECT EXTRACT(DOW  FROM a.scheduled_start AT TIME ZONE 'Asia/Baghdad')::int AS dow,
           EXTRACT(HOUR FROM a.scheduled_start AT TIME ZONE 'Asia/Baghdad')::int AS hour,
           COUNT(*)::int AS total
    FROM appointments a
    WHERE a.tenant_id = $3 AND a.branch_id = $4 AND a.is_deleted = false
      AND a.status NOT IN ('cancelled', 'no_show')
      AND a.scheduled_start >= $1 AND a.scheduled_start < $2
    GROUP BY 1, 2`;
  const { rows } = await pool.query(query, [since, now, tenant_id, branch_id]);
  return rows;
}

// Every treatment done in this branch this month with its quantity.
async function getTreatments(monthStart, now, tenant_id, branch_id) {
  const query = `
    SELECT wc.name AS label, SUM(COALESCE(sw.quantity, 1))::int AS value
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id AND wc.tenant_id = sw.tenant_id AND wc.branch_id = sw.branch_id
    JOIN sessions s ON s.id = sw.session_id AND s.tenant_id = sw.tenant_id AND s.branch_id = sw.branch_id
    WHERE s.tenant_id = $3 AND s.branch_id = $4 AND s.created_at >= $1 AND s.created_at < $2
      AND sw.is_deleted = false AND s.is_deleted = false
    GROUP BY wc.name
    ORDER BY value DESC, wc.name
    LIMIT 8`;
  const { rows } = await pool.query(query, [monthStart, now, tenant_id, branch_id]);
  return rows;
}

export default {
  getCounts, getTodayAppointments, getRevenueWindows, getUnpaid,
  getDoctorWork, getDoctorIncome, getBusyTimes, getTreatments,
}
