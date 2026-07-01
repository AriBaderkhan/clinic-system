import pool from '../db_connection.js'

// ─────────────────────────────────────────────────────────────────────────────
// CURRENCY-AWARE MONEY QUERIES
// Every transaction row is stamped with the currency it was created in
// (currency_code, frozen at creation). Money of different currencies must NEVER
// be summed together, so these group by currency_code and return one row PER
// currency. Callers present each currency separately.
// ─────────────────────────────────────────────────────────────────────────────

// The clinic (tenant) name — for the report title (per-tenant, not hard-coded).
async function getTenantName(tenant_id) {
  const { rows } = await pool.query('SELECT name FROM tenants WHERE id = $1', [tenant_id]);
  return rows[0]?.name || '';
}

// Single branch — session-payment revenue per currency.
async function sessionsRevByCurrency(from, to, tenant_id, branch_id) {
  const query = `
    SELECT currency_code, COALESCE(SUM(amount), 0) AS total
    FROM session_payments
    WHERE created_at >= $1 AND created_at < $2 AND tenant_id = $3 AND branch_id = $4
    GROUP BY currency_code`;
  const { rows } = await pool.query(query, [from, to, tenant_id, branch_id]);
  return rows;
}

// Single branch — treatment-plan-payment revenue per currency.
async function plansRevByCurrency(from, to, tenant_id, branch_id) {
  const query = `
    SELECT currency_code, COALESCE(SUM(amount), 0) AS total
    FROM treatment_payments
    WHERE created_at >= $1 AND created_at < $2 AND tenant_id = $3 AND branch_id = $4
    GROUP BY currency_code`;
  const { rows } = await pool.query(query, [from, to, tenant_id, branch_id]);
  return rows;
}

// Single branch — expenses per currency.
// Attributed by expense_date (WHEN it happened), not created_at (when it was
// typed in). expense_date is a calendar DATE → interpret it as clinic-local
// midnight so it lines up with the revenue window (and today's expenses still
// count in the current-month report). Falls back to created_at if a row has no
// expense_date, so no expense is ever dropped.
async function expensesByCurrency(from, to, tenant_id, branch_id) {
  const query = `
    SELECT currency_code, COALESCE(SUM(amount), 0) AS total
    FROM monthly_expenses
    WHERE (COALESCE(expense_date, created_at::date)::timestamp AT TIME ZONE 'Asia/Baghdad') >= $1
      AND (COALESCE(expense_date, created_at::date)::timestamp AT TIME ZONE 'Asia/Baghdad') < $2
      AND tenant_id = $3 AND branch_id = $4
    GROUP BY currency_code`;
  const { rows } = await pool.query(query, [from, to, tenant_id, branch_id]);
  return rows;
}

// Clinic-wide — session revenue per branch per currency.
async function sessionsRevByBranchCurrency(from, to, tenant_id) {
  const query = `
    SELECT b.name AS branch_name, sp.currency_code, COALESCE(SUM(sp.amount), 0) AS total
    FROM session_payments sp
    JOIN branches b ON b.id = sp.branch_id
    WHERE sp.created_at >= $1 AND sp.created_at < $2 AND sp.tenant_id = $3
    GROUP BY b.name, sp.currency_code`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Clinic-wide — treatment-plan revenue per branch per currency.
async function plansRevByBranchCurrency(from, to, tenant_id) {
  const query = `
    SELECT b.name AS branch_name, tp.currency_code, COALESCE(SUM(tp.amount), 0) AS total
    FROM treatment_payments tp
    JOIN branches b ON b.id = tp.branch_id
    WHERE tp.created_at >= $1 AND tp.created_at < $2 AND tp.tenant_id = $3
    GROUP BY b.name, tp.currency_code`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Clinic-wide — expenses per branch per currency. Attributed by expense_date
// (see expensesByCurrency), falling back to created_at when unset.
async function expensesByBranchCurrency(from, to, tenant_id) {
  const query = `
    SELECT b.name AS branch_name, me.currency_code, COALESCE(SUM(me.amount), 0) AS total
    FROM monthly_expenses me
    JOIN branches b ON b.id = me.branch_id
    WHERE (COALESCE(me.expense_date, me.created_at::date)::timestamp AT TIME ZONE 'Asia/Baghdad') >= $1
      AND (COALESCE(me.expense_date, me.created_at::date)::timestamp AT TIME ZONE 'Asia/Baghdad') < $2
      AND me.tenant_id = $3
    GROUP BY b.name, me.currency_code`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}


async function registeredPatient(from, to, tenant_id, branch_id) {
  const query = `SELECT * FROM patients WHERE created_at >= $1 AND created_at < $2 AND tenant_id = $3 AND branch_id = $4`
  const values = [from, to, tenant_id, branch_id]
  const { rows } = await pool.query(query, values);
  return rows.length;

}


async function getAppts(from, to, tenant_id, branch_id) {
  const query = `SELECT * FROM appointments WHERE scheduled_start >= $1 AND scheduled_start < $2 AND tenant_id = $3 AND branch_id = $4`
  const values = [from, to, tenant_id, branch_id]
  const { rows } = await pool.query(query, values);
  return rows.length;

}


async function patientsHasAppt(from, to, tenant_id, branch_id) {
  const query = `SELECT DISTINCT patient_id FROM appointments WHERE scheduled_start >= $1 AND scheduled_start < $2 AND tenant_id = $3 AND branch_id = $4`
  const values = [from, to, tenant_id, branch_id]
  const { rows } = await pool.query(query, values);
  return rows.length;

}

async function apptForEachDoctor(from, to, tenant_id, branch_id) {
  const query = `
    SELECT  
        pr.full_name AS doctor_name,
        COUNT(*) AS total_appointments
    FROM appointments 
    JOIN profiles pr ON pr.user_id=doctor_id
    WHERE scheduled_start >= $1 AND scheduled_start < $2 AND tenant_id = $3 AND branch_id = $4
    GROUP BY pr.full_name
    ORDER BY total_appointments DESC;`
  const values = [from, to, tenant_id, branch_id]
  const { rows } = await pool.query(query, values);
  return rows;

}

async function apptsDoneByStatus(from, to, tenant_id, branch_id) {
  const query = `
    SELECT  
        status,
        COUNT(*) AS status_total
    FROM appointments 
    WHERE scheduled_start >= $1 AND scheduled_start < $2 AND tenant_id = $3 AND branch_id = $4
    GROUP BY status;`
  const values = [from, to, tenant_id, branch_id]
  const { rows } = await pool.query(query, values);
  return rows;
}

async function sumOfSessionsAmount(from, to, tenant_id, branch_id) {
  const query = `
    SELECT COALESCE(SUM(amount), 0) AS total_paid
    FROM session_payments
    WHERE created_at >= $1 AND created_at < $2 AND tenant_id = $3 AND branch_id = $4
  `;
  const values = [from, to, tenant_id, branch_id]
  const { rows: sumRows } = await pool.query(query, values);
  const totalPaid = Number(sumRows[0].total_paid);
  return totalPaid

}

async function sumOfTreatmentPlansAmount(from, to, tenant_id, branch_id) {
  const query = `
    SELECT COALESCE(SUM(amount), 0) AS total_paid
    FROM treatment_payments
    WHERE created_at >= $1 AND created_at < $2 AND tenant_id = $3 AND branch_id = $4
  `;
  const values = [from, to, tenant_id, branch_id]
  const { rows: sumRows } = await pool.query(query, values);
  const totalPaid = Number(sumRows[0].total_paid);
  return totalPaid

}

async function monthlyExpenses(from, to, tenant_id, branch_id) {
  const query = `
    SELECT 
      COALESCE(SUM(amount),0) AS total_expenses
    FROM monthly_expenses
    WHERE (created_at >= $1 AND created_at < $2) AND tenant_id = $3 AND branch_id = $4;
  `;
  const value = [from, to, tenant_id, branch_id]
  const { rows: sumRows } = await pool.query(query, value);
  const total_monthly_expense = Number(sumRows[0]?.total_expenses || 0);
  return total_monthly_expense

}

async function theMostWorkDone(from, to, tenant_id, branch_id) {
  const query = `
    SELECT
        sw.work_id,
        wc.code AS work_code,
        SUM(COALESCE(sw.quantity, 1)) AS total_qty
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id AND wc.tenant_id = sw.tenant_id AND wc.branch_id = sw.branch_id
    JOIN sessions s ON s.id = sw.session_id AND s.tenant_id = sw.tenant_id AND s.branch_id = sw.branch_id
    WHERE s.created_at >= $1 AND s.created_at < $2 AND s.tenant_id = $3 AND s.branch_id = $4
    GROUP BY sw.work_id, wc.code
    ORDER BY total_qty DESC
    LIMIT 1;
  `;
  const values = [from, to, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  const the_most_work_done = rows[0];
  return the_most_work_done;
}

async function theLeastWorkDone(from, to, tenant_id, branch_id) {
  const query = `
    SELECT
        sw.work_id,
        wc.code AS work_code,
        SUM(COALESCE(sw.quantity, 1)) AS total_qty
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id AND wc.tenant_id = sw.tenant_id AND wc.branch_id = sw.branch_id
    JOIN sessions s ON s.id = sw.session_id AND s.tenant_id = sw.tenant_id AND s.branch_id = sw.branch_id
    WHERE s.created_at >= $1 AND s.created_at < $2 AND s.tenant_id = $3 AND s.branch_id = $4
    GROUP BY sw.work_id, wc.code
    ORDER BY total_qty ASC
    LIMIT 1;
  `;
  const values = [from, to, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  const the_least_work_done = rows[0];
  return the_least_work_done

}


// ----------------------------------------------------------------------
// CLINIC-WIDE REPORT FUNCTIONS (Group By Branch)
// ----------------------------------------------------------------------

async function registeredPatientByBranch(from, to, tenant_id) {
  const query = `
    SELECT 
      b.name AS branch_name,
      COUNT(*) AS total
    FROM patients p
    JOIN branches b ON b.id = p.branch_id
    WHERE p.created_at >= $1 AND p.created_at < $2 AND p.tenant_id = $3
    GROUP BY b.name
    ORDER BY total DESC;
  `;
  const values = [from, to, tenant_id];
  const { rows } = await pool.query(query, values);
  return rows;
}

async function getApptsByBranch(from, to, tenant_id) {
  const query = `
    SELECT 
      b.name AS branch_name,
      COUNT(*) AS total
    FROM appointments a
    JOIN branches b ON b.id = a.branch_id
    WHERE a.scheduled_start >= $1 AND a.scheduled_start < $2 AND a.tenant_id = $3
    GROUP BY b.name
    ORDER BY total DESC;
  `;
  const values = [from, to, tenant_id];
  const { rows } = await pool.query(query, values);
  return rows;
}

async function patientsHasApptByBranch(from, to, tenant_id) {
  const query = `
    SELECT 
      b.name AS branch_name,
      COUNT(DISTINCT a.patient_id) AS total
    FROM appointments a
    JOIN branches b ON b.id = a.branch_id
    WHERE a.scheduled_start >= $1 AND a.scheduled_start < $2 AND a.tenant_id = $3
    GROUP BY b.name
    ORDER BY total DESC;
  `;
  const values = [from, to, tenant_id];
  const { rows } = await pool.query(query, values);
  return rows;
}

async function apptForEachDoctorByBranch(from, to, tenant_id) {
  // Returns list of doctors with their branch name
  const query = `
    SELECT  
        b.name AS branch_name,
        pr.full_name AS doctor_name,
        COUNT(*) AS total_appointments
    FROM appointments a
    JOIN profiles pr ON pr.user_id = a.doctor_id
    JOIN branches b ON b.id = a.branch_id
    WHERE a.scheduled_start >= $1 AND a.scheduled_start < $2 AND a.tenant_id = $3
    GROUP BY b.name, pr.full_name
    ORDER BY b.name, total_appointments DESC;
  `;
  const values = [from, to, tenant_id];
  const { rows } = await pool.query(query, values);
  return rows;
}

async function apptsDoneByStatusByBranch(from, to, tenant_id) {
  const query = `
    SELECT  
        b.name AS branch_name,
        a.status,
        COUNT(*) AS status_total
    FROM appointments a
    JOIN branches b ON b.id = a.branch_id
    WHERE a.scheduled_start >= $1 AND a.scheduled_start < $2 AND a.tenant_id = $3
    GROUP BY b.name, a.status
    ORDER BY b.name, status_total DESC;
  `;
  const values = [from, to, tenant_id];
  const { rows } = await pool.query(query, values);
  return rows;
}

async function sumOfSessionsAmountByBranch(from, to, tenant_id) {
  const query = `
    SELECT 
      b.name AS branch_name,
      COALESCE(SUM(sp.amount), 0) AS total_paid
    FROM session_payments sp
    JOIN branches b ON b.id = sp.branch_id
    WHERE sp.created_at >= $1 AND sp.created_at < $2 AND sp.tenant_id = $3
    GROUP BY b.name;
  `;
  const values = [from, to, tenant_id];
  const { rows } = await pool.query(query, values);
  return rows;
}

async function sumOfTreatmentPlansAmountByBranch(from, to, tenant_id) {
  const query = `
    SELECT 
      b.name AS branch_name,
      COALESCE(SUM(tp.amount), 0) AS total_paid
    FROM treatment_payments tp
    JOIN branches b ON b.id = tp.branch_id
    WHERE tp.created_at >= $1 AND tp.created_at < $2 AND tp.tenant_id = $3
    GROUP BY b.name;
  `;
  const values = [from, to, tenant_id];
  const { rows } = await pool.query(query, values);
  return rows;
}

async function monthlyExpensesByBranch(from, to, tenant_id) {
  const query = `
    SELECT 
      b.name AS branch_name,
      COALESCE(SUM(amount), 0) AS total_expenses
    FROM monthly_expenses me
    JOIN branches b ON b.id = me.branch_id
    WHERE me.created_at >= $1 AND me.created_at < $2 AND me.tenant_id = $3
    GROUP BY b.name;
  `;
  const values = [from, to, tenant_id];
  const { rows } = await pool.query(query, values);
  return rows;
}

async function theMostWorkDoneByBranch(from, to, tenant_id) {
  // Get top work PER BRANCH? Or top work overall?
  // Let's get top work per branch to show detail.
  // Using DISTINCT ON (branch_id) or window function to get rank 1 per branch would be best,
  // but let's keep it simple: just list all works grouped by branch and let frontend/service pick top one?
  // Or simpler: Just get top 1 OVERALL?
  // User wanted "branch shorsh ... empire ...".
  // So probably top work for EACH branch.

  // This query gets top work per branch using Postgres DISTINCT ON
  const query = `
    SELECT DISTINCT ON (b.name)
        b.name AS branch_name,
        wc.code AS work_code,
        SUM(COALESCE(sw.quantity, 1)) AS total_qty
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id
    JOIN sessions s ON s.id = sw.session_id
    JOIN branches b ON b.id = s.branch_id
    WHERE s.created_at >= $1 AND s.created_at < $2 AND s.tenant_id = $3
    GROUP BY b.name, sw.work_id, wc.code
    ORDER BY b.name, total_qty DESC;
  `;
  const values = [from, to, tenant_id];
  const { rows } = await pool.query(query, values);
  return rows;
}

async function theLeastWorkDoneByBranch(from, to, tenant_id) {
  const query = `
    SELECT DISTINCT ON (b.name)
        b.name AS branch_name,
        wc.code AS work_code,
        SUM(COALESCE(sw.quantity, 1)) AS total_qty
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id
    JOIN sessions s ON s.id = sw.session_id
    JOIN branches b ON b.id = s.branch_id
    WHERE s.created_at >= $1 AND s.created_at < $2 AND s.tenant_id = $3
    GROUP BY b.name, sw.work_id, wc.code
    ORDER BY b.name, total_qty ASC;
  `;
  const values = [from, to, tenant_id];
  const { rows } = await pool.query(query, values);
  return rows;
}

// ----------------------------------------------------------------------
// INSIGHTS ASSISTANT FUNCTIONS (tenant-wide, grouped by branch)
// Read-only. Feed the tenant_manager assistant widget via insightsService.js.
// Every row carries branch_name so the service can show per-branch + totals.
// ----------------------------------------------------------------------

// The tenant's branches — used to decide single vs multi-branch display and to
// show every branch (including ones with zero activity in the period).
async function getTenantBranches(tenant_id) {
  const query = `SELECT id, name FROM branches WHERE tenant_id = $1 ORDER BY name ASC`;
  const { rows } = await pool.query(query, [tenant_id]);
  return rows;
}

// Returning patients: registered BEFORE the period, but had an appointment IN it.
async function returningPatientsByBranch(from, to, tenant_id) {
  const query = `
    SELECT b.name AS branch_name, COUNT(DISTINCT a.patient_id) AS total
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    JOIN branches b ON b.id = a.branch_id
    WHERE a.tenant_id = $3 AND a.scheduled_start >= $1 AND a.scheduled_start < $2
      AND p.created_at < $1
    GROUP BY b.name
    ORDER BY total DESC;`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Patients grouped into age buckets. If from/to are null → all-time (overall).
async function patientsByAgeBucketByBranch(from, to, tenant_id) {
  const values = [tenant_id];
  let dateFilter = '';
  if (from && to) {
    dateFilter = ` AND p.created_at >= $2 AND p.created_at < $3`;
    values.push(from, to);
  }
  const query = `
    SELECT
      b.name AS branch_name,
      CASE WHEN p.age < 20 THEN '6-19'
           WHEN p.age < 45 THEN '20-44'
           ELSE '45+' END AS label,
      COUNT(*) AS total
    FROM patients p
    JOIN branches b ON b.id = p.branch_id
    WHERE p.tenant_id = $1${dateFilter}
    GROUP BY b.name, label
    ORDER BY b.name, label;`;
  const { rows } = await pool.query(query, values);
  return rows;
}

// Why each patient came (referral source), for patients registered in the period.
async function referralBreakdownByBranch(from, to, tenant_id) {
  const query = `
    SELECT
      b.name AS branch_name,
      COALESCE(NULLIF(TRIM(p.referral_source), ''), 'Unknown') AS label,
      COUNT(*) AS total
    FROM patients p
    JOIN branches b ON b.id = p.branch_id
    WHERE p.tenant_id = $3 AND p.created_at >= $1 AND p.created_at < $2
    GROUP BY b.name, label
    ORDER BY b.name, total DESC;`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Top cancellation reasons (status = cancelled) in the period.
async function cancellationReasonsByBranch(from, to, tenant_id) {
  const query = `
    SELECT
      b.name AS branch_name,
      COALESCE(NULLIF(TRIM(a.cancel_reason), ''), 'No reason given') AS label,
      COUNT(*) AS total
    FROM appointments a
    JOIN branches b ON b.id = a.branch_id
    WHERE a.tenant_id = $3 AND a.scheduled_start >= $1 AND a.scheduled_start < $2
      AND a.status = 'cancelled'
    GROUP BY b.name, label
    ORDER BY b.name, total DESC;`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Follow-up patients: distinct patients who had a 'follow_up' work in the period.
async function followUpPatientsByBranch(from, to, tenant_id) {
  const query = `
    SELECT b.name AS branch_name, COUNT(DISTINCT a.patient_id) AS total
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id AND wc.tenant_id = sw.tenant_id AND wc.branch_id = sw.branch_id
    JOIN sessions s ON s.id = sw.session_id AND s.tenant_id = sw.tenant_id AND s.branch_id = sw.branch_id
    JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
    JOIN branches b ON b.id = s.branch_id
    WHERE s.tenant_id = $3 AND s.created_at >= $1 AND s.created_at < $2
      AND wc.code = 'follow_up'
    GROUP BY b.name
    ORDER BY total DESC;`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Every treatment with its quantity (full ordered list). Most = first, least = last.
async function treatmentBreakdownByBranch(from, to, tenant_id) {
  const query = `
    SELECT
      b.name AS branch_name,
      wc.name AS label,
      SUM(COALESCE(sw.quantity, 1)) AS total
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id AND wc.tenant_id = sw.tenant_id AND wc.branch_id = sw.branch_id
    JOIN sessions s ON s.id = sw.session_id AND s.tenant_id = sw.tenant_id AND s.branch_id = sw.branch_id
    JOIN branches b ON b.id = s.branch_id
    WHERE s.tenant_id = $3 AND s.created_at >= $1 AND s.created_at < $2
    GROUP BY b.name, wc.name
    ORDER BY b.name, total DESC;`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Revenue per doctor (Option B): session payments + treatment-plan payments that
// trace to a doctor via their session. Plan payments with NO session_id fall into
// an "Unassigned" row (only appears if such payments exist).
async function revenuePerDoctorByBranch(from, to, tenant_id) {
  const query = `
    WITH pay AS (
      SELECT sp.branch_id, a.doctor_id, sp.amount
      FROM session_payments sp
      JOIN sessions s ON s.id = sp.session_id AND s.tenant_id = sp.tenant_id AND s.branch_id = sp.branch_id
      JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
      WHERE sp.tenant_id = $3 AND sp.created_at >= $1 AND sp.created_at < $2
      UNION ALL
      SELECT tp.branch_id, a.doctor_id, tp.amount
      FROM treatment_payments tp
      JOIN sessions s ON s.id = tp.session_id AND s.tenant_id = tp.tenant_id AND s.branch_id = tp.branch_id
      JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
      WHERE tp.tenant_id = $3 AND tp.created_at >= $1 AND tp.created_at < $2 AND tp.session_id IS NOT NULL
      UNION ALL
      SELECT tp.branch_id, NULL AS doctor_id, tp.amount
      FROM treatment_payments tp
      WHERE tp.tenant_id = $3 AND tp.created_at >= $1 AND tp.created_at < $2 AND tp.session_id IS NULL
    )
    SELECT
      b.name AS branch_name,
      COALESCE(pr.full_name, 'Unassigned') AS label,
      COALESCE(SUM(pay.amount), 0) AS total
    FROM pay
    JOIN branches b ON b.id = pay.branch_id
    LEFT JOIN profiles pr ON pr.user_id = pay.doctor_id
    GROUP BY b.name, pr.full_name
    ORDER BY b.name, total DESC;`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Revenue per treatment = billed value (SUM of session_works.total_price) per work.
// (Cash payments are per-session, not per-work, so the billed value is the only
// honest per-treatment revenue figure.)
async function revenuePerTreatmentByBranch(from, to, tenant_id) {
  const query = `
    SELECT
      b.name AS branch_name,
      wc.name AS label,
      COALESCE(SUM(sw.total_price), 0) AS total
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id AND wc.tenant_id = sw.tenant_id AND wc.branch_id = sw.branch_id
    JOIN sessions s ON s.id = sw.session_id AND s.tenant_id = sw.tenant_id AND s.branch_id = sw.branch_id
    JOIN branches b ON b.id = s.branch_id
    WHERE s.tenant_id = $3 AND s.created_at >= $1 AND s.created_at < $2
    GROUP BY b.name, wc.name
    ORDER BY b.name, total DESC;`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

// Flat list of appointments in a window, across all branches, with patient,
// doctor and branch names. Used by the tenant-manager dashboard "today" view.
async function appointmentsListByBranch(from, to, tenant_id) {
  const query = `
    SELECT
      a.id,
      p.name        AS patient_name,
      pr.full_name  AS doctor_name,
      b.name        AS branch_name,
      a.scheduled_start,
      a.status
    FROM appointments a
    JOIN patients p  ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    JOIN branches b  ON b.id = a.branch_id
    LEFT JOIN profiles pr ON pr.user_id = a.doctor_id
    WHERE a.tenant_id = $3 AND a.scheduled_start >= $1 AND a.scheduled_start < $2
    ORDER BY a.scheduled_start ASC;`;
  const { rows } = await pool.query(query, [from, to, tenant_id]);
  return rows;
}

export default {
  // Currency-aware money (per currency) + tenant name
  getTenantName,
  sessionsRevByCurrency, plansRevByCurrency, expensesByCurrency,
  sessionsRevByBranchCurrency, plansRevByBranchCurrency, expensesByBranchCurrency,

  registeredPatient, getAppts, patientsHasAppt, apptForEachDoctor, apptsDoneByStatus,
  sumOfSessionsAmount, sumOfTreatmentPlansAmount, monthlyExpenses, theMostWorkDone,
  theLeastWorkDone,
  // Clinic-Wide Exports
  registeredPatientByBranch,
  getApptsByBranch,
  patientsHasApptByBranch,
  apptForEachDoctorByBranch,
  apptsDoneByStatusByBranch,
  sumOfSessionsAmountByBranch,
  sumOfTreatmentPlansAmountByBranch,
  monthlyExpensesByBranch,
  theMostWorkDoneByBranch,
  theLeastWorkDoneByBranch,
  // Insights Assistant Exports
  getTenantBranches,
  returningPatientsByBranch,
  patientsByAgeBucketByBranch,
  referralBreakdownByBranch,
  cancellationReasonsByBranch,
  followUpPatientsByBranch,
  treatmentBreakdownByBranch,
  revenuePerDoctorByBranch,
  revenuePerTreatmentByBranch,
  appointmentsListByBranch
}