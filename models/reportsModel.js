import pool from '../db_connection.js'


async function registeredPatient(from,to){
    const query = `SELECT * FROM patients WHERE created_at >= $1 AND created_at < $2`
    const values = [from,to]
    const {rows} = await pool.query(query,values);
    return rows.length;

}


async function getAppts(from,to){
    const query = `SELECT * FROM appointments WHERE scheduled_start >= $1 AND scheduled_start < $2`
    const values = [from,to]
    const {rows} = await pool.query(query,values);
    return rows.length;

}


async function patientsHasAppt(from,to){
    const query = `SELECT DISTINCT patient_id FROM appointments WHERE scheduled_start >= $1 AND scheduled_start < $2`
    const values = [from,to]
    const {rows} = await pool.query(query,values);
    return rows.length;

}

async function apptForEachDoctor(from,to){
    const query = `
    SELECT  
        pr.full_name AS doctor_name,
        COUNT(*) AS total_appointments
    FROM appointments 
    JOIN profiles pr ON pr.user_id=doctor_id
    WHERE scheduled_start >= $1 AND scheduled_start < $2
    GROUP BY pr.full_name
    ORDER BY total_appointments DESC;`
    const values = [from,to]
    const {rows} = await pool.query(query,values);
    return rows;

}

async function apptsDoneByStatus(from,to){
    const query = `
    SELECT  
        status,
        COUNT(*) AS status_total
    FROM appointments 
    WHERE scheduled_start >= $1 AND scheduled_start < $2
    GROUP BY status;`
    const values = [from,to]
    const {rows} = await pool.query(query,values);
    return rows;
}

async function sumOfSessionsAmount(from,to) {
  const query = `
    SELECT COALESCE(SUM(amount), 0) AS total_paid
    FROM session_payments
    WHERE created_at >= $1 AND created_at < $2
  `;
  const values = [from,to]
  const { rows: sumRows } = await pool.query(query, values);
  const totalPaid = Number(sumRows[0].total_paid);
  return totalPaid

}

async function sumOfTreatmentPlansAmount(from,to) {
  const query = `
    SELECT COALESCE(SUM(amount), 0) AS total_paid
    FROM treatment_payments
    WHERE created_at >= $1 AND created_at < $2
  `;
  const values = [from,to]
  const { rows: sumRows } = await pool.query(query, values);
  const totalPaid = Number(sumRows[0].total_paid);
  return totalPaid

}

async function monthlyExpenses(month) {
  const query = `
    SELECT 
        (COALESCE(materials, 0) + 
        COALESCE(salary, 0) + 
        COALESCE(electric, 0) + 
        COALESCE(company_total, 0) + 
        COALESCE(rent, 0) + 
        COALESCE(tax, 0) + 
        COALESCE(marketing, 0) + 
        COALESCE(other, 0)) AS monthly_expense
    FROM monthly_expenses
    WHERE month = $1;
  `;
  const value = [month]
  const { rows:sumRows } = await pool.query(query, value);
  const total_monthly_expense = Number(sumRows[0]?.monthly_expense || 0) ;
  return total_monthly_expense

}

async function theMostWorkDone(from,to) {
  const query = `
    SELECT
        sw.work_id,
        wc.code AS work_code,
        SUM(COALESCE(sw.quantity, 1)) AS total_qty
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id
    JOIN sessions s ON s.id = sw.session_id
    WHERE s.created_at >= $1 AND s.created_at < $2
    GROUP BY sw.work_id, wc.code
    ORDER BY total_qty DESC
    LIMIT 1;
  `;
  const values = [from,to]
  const { rows } = await pool.query(query, values);
  const the_most_work_done = rows[0] ;
  return the_most_work_done

}

async function theLeastWorkDone(from,to) {
  const query = `
    SELECT
        sw.work_id,
        wc.code AS work_code,
        SUM(COALESCE(sw.quantity, 1)) AS total_qty
    FROM session_works sw
    JOIN work_catalog wc ON wc.id = sw.work_id
    JOIN sessions s ON s.id = sw.session_id
    WHERE s.created_at >= $1 AND s.created_at < $2
    GROUP BY sw.work_id, wc.code
    ORDER BY total_qty ASC
    LIMIT 1;
  `;
  const values = [from,to]
  const { rows } = await pool.query(query, values);
  const the_least_work_done = rows[0] ;
  return the_least_work_done

}

export default {
    registeredPatient, getAppts, patientsHasAppt, apptForEachDoctor, apptsDoneByStatus, 
    sumOfSessionsAmount,sumOfTreatmentPlansAmount, monthlyExpenses, theMostWorkDone,
    theLeastWorkDone

}