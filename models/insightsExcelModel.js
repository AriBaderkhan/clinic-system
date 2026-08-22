import pool from '../db_connection.js';

// Read-only queries feeding the Insights Excel export. Tenant-wide (all branches),
// period-scoped, and — unlike the widget's revenue helpers — money is ALWAYS kept
// per currency_code so IQD and USD are never added together.
// Weekdays/dates are grouped in clinic-local time so "Saturday" means the clinic's
// Saturday, not UTC's.
const TZ = 'Asia/Baghdad';

// Total revenue per currency = session payments + treatment-plan payments.
async function revenueByCurrency(from, to, tenant_id) {
  const sessions = await pool.query(
    `SELECT currency_code, COALESCE(SUM(amount), 0) AS total
       FROM session_payments
      WHERE created_at >= $1 AND created_at < $2 AND tenant_id = $3
      GROUP BY currency_code`,
    [from, to, tenant_id]
  );
  const plans = await pool.query(
    `SELECT currency_code, COALESCE(SUM(amount), 0) AS total
       FROM treatment_payments
      WHERE created_at >= $1 AND created_at < $2 AND tenant_id = $3 AND is_deleted = false
      GROUP BY currency_code`,
    [from, to, tenant_id]
  );
  return { sessions: sessions.rows, plans: plans.rows };
}

// Revenue per doctor, per currency (session + plan payments traced to the doctor
// via their session). Plan payments with no session are left out here.
async function revenuePerDoctor(from, to, tenant_id) {
  const query = `
    WITH pay AS (
      SELECT a.doctor_id, sp.currency_code, sp.amount
      FROM session_payments sp
      JOIN sessions s ON s.id = sp.session_id AND s.tenant_id = sp.tenant_id AND s.branch_id = sp.branch_id
      JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
      WHERE sp.tenant_id = $3 AND sp.created_at >= $1 AND sp.created_at < $2
      UNION ALL
      SELECT a.doctor_id, tp.currency_code, tp.amount
      FROM treatment_payments tp
      JOIN sessions s ON s.id = tp.session_id AND s.tenant_id = tp.tenant_id AND s.branch_id = tp.branch_id
      JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
      WHERE tp.tenant_id = $3 AND tp.created_at >= $1 AND tp.created_at < $2 AND tp.session_id IS NOT NULL AND tp.is_deleted = false
    )
    SELECT COALESCE(pr.full_name, 'Unassigned') AS doctor,
           pay.currency_code,
           COALESCE(SUM(pay.amount), 0) AS total
    FROM pay
    LEFT JOIN profiles pr ON pr.user_id = pay.doctor_id
    GROUP BY pr.full_name, pay.currency_code
    ORDER BY total DESC`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Works ranked: how many times each work was done + its BILLED value
// (SUM of session_works.total_price), per currency, dated by the session.
// is_plan/code let the service swap billed for actually-collected on plan works.
async function worksRanked(from, to, tenant_id) {
  const query = `
    SELECT wc.name AS work,
           LOWER(wc.code) AS code,
           wc.is_plan AS is_plan,
           SUM(COALESCE(sw.quantity, 1)) AS times_done,
           COALESCE(SUM(sw.total_price), 0) AS billed,
           s.currency_code
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id AND wc.tenant_id = sw.tenant_id AND wc.branch_id = sw.branch_id
    JOIN sessions s ON s.id = sw.session_id AND s.tenant_id = sw.tenant_id AND s.branch_id = sw.branch_id
    WHERE s.tenant_id = $3 AND s.created_at >= $1 AND s.created_at < $2 AND sw.is_deleted = false
    GROUP BY wc.name, LOWER(wc.code), wc.is_plan, s.currency_code
    ORDER BY times_done DESC, billed DESC`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Money actually COLLECTED for plan works, grouped by plan type + currency.
// Plan type == the work's (lowercased) code, so the service can match a plan work
// row to its collected total. Dated by payment date (when the cash came in).
async function collectedByPlanType(from, to, tenant_id) {
  const query = `
    SELECT tp.type AS plan_type,
           pay.currency_code,
           COALESCE(SUM(pay.amount), 0) AS collected
    FROM treatment_payments pay
    JOIN treatment_plans tp ON tp.id = pay.treatment_plan_id
    WHERE pay.tenant_id = $3 AND pay.created_at >= $1 AND pay.created_at < $2 AND pay.is_deleted = false
    GROUP BY tp.type, pay.currency_code`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Appointments + distinct patients per weekday (clinic-local). dow: 0=Sun .. 6=Sat.
async function apptsByWeekday(from, to, tenant_id) {
  const query = `
    SELECT EXTRACT(DOW FROM (scheduled_start AT TIME ZONE $4))::int AS dow,
           COUNT(*) AS appts,
           COUNT(DISTINCT patient_id) AS patients
    FROM appointments
    WHERE tenant_id = $3 AND scheduled_start >= $1 AND scheduled_start < $2 AND is_deleted = false
    GROUP BY dow`;
  const { rows } = await pool.query(query, [from, to, tenant_id, TZ]);
  return rows;
}

// Appointments per type (normal / urgent / walk_in).
async function apptsByType(from, to, tenant_id) {
  const query = `
    SELECT COALESCE(appointment_type, 'normal') AS type, COUNT(*) AS count
    FROM appointments
    WHERE tenant_id = $3 AND scheduled_start >= $1 AND scheduled_start < $2 AND is_deleted = false
    GROUP BY appointment_type
    ORDER BY count DESC`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Appointments per status (for total, cancelled, no-show, completed).
async function apptStatusCounts(from, to, tenant_id) {
  const query = `
    SELECT status, COUNT(*) AS count
    FROM appointments
    WHERE tenant_id = $3 AND scheduled_start >= $1 AND scheduled_start < $2 AND is_deleted = false
    GROUP BY status`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// The single busiest date in the period (most appointments).
async function busiestDate(from, to, tenant_id) {
  const query = `
    SELECT (scheduled_start AT TIME ZONE $4)::date AS date, COUNT(*) AS appts
    FROM appointments
    WHERE tenant_id = $3 AND scheduled_start >= $1 AND scheduled_start < $2 AND is_deleted = false
    GROUP BY date
    ORDER BY appts DESC, date ASC
    LIMIT 1`;
  const { rows } = await pool.query(query, [from, to, tenant_id, TZ]);
  return rows[0] || null;
}

export default {
  revenueByCurrency,
  revenuePerDoctor,
  worksRanked,
  collectedByPlanType,
  apptsByWeekday,
  apptsByType,
  apptStatusCounts,
  busiestDate,
};
