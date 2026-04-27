import pool from '../db_connection.js'


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

export default {
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
  theLeastWorkDoneByBranch
}