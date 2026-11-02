import pool from '../db_connection.js';

// "Own" records of a user (used when their tick is "own only"):
//   appointment : its doctor is the user
//   visit       : its appointment's doctor is the user
//   patient     : has an appointment with the user, or the user added them
//   plan        : its patient is the user's own

// SQL piece for patient lists: is patient <alias> one of user $idx's own?
export const ownPatientSql = (alias, idx) => `
  (${alias}.created_by = $${idx}
   OR EXISTS (SELECT 1 FROM appointments oa
               WHERE oa.patient_id = ${alias}.id AND oa.tenant_id = ${alias}.tenant_id
                 AND oa.doctor_id = $${idx} AND oa.is_deleted = false))`;

async function isOwnAppointment(appointment_id, user_id, tenant_id, branch_id) {
    const query = `
    SELECT 1 FROM appointments
     WHERE id = $1 AND doctor_id = $2 AND tenant_id = $3 AND branch_id = $4`;
    const { rows } = await pool.query(query, [appointment_id, user_id, tenant_id, branch_id]);
    return rows.length > 0;
}

async function isOwnSession(session_id, user_id, tenant_id, branch_id) {
    const query = `
    SELECT 1 FROM sessions s
      JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
     WHERE s.id = $1 AND a.doctor_id = $2 AND s.tenant_id = $3 AND s.branch_id = $4`;
    const { rows } = await pool.query(query, [session_id, user_id, tenant_id, branch_id]);
    return rows.length > 0;
}

async function isOwnPatient(patient_id, user_id, tenant_id) {
    const query = `SELECT 1 FROM patients p WHERE p.id = $1 AND p.tenant_id = $3 AND ${ownPatientSql('p', 2)}`;
    const { rows } = await pool.query(query, [patient_id, user_id, tenant_id]);
    return rows.length > 0;
}

async function isOwnPlan(plan_id, user_id, tenant_id) {
    const query = `
    SELECT 1 FROM treatment_plans tp
      JOIN patients p ON p.id = tp.patient_id AND p.tenant_id = tp.tenant_id
     WHERE tp.id = $1 AND tp.tenant_id = $3 AND ${ownPatientSql('p', 2)}`;
    const { rows } = await pool.query(query, [plan_id, user_id, tenant_id]);
    return rows.length > 0;
}

export default { isOwnAppointment, isOwnSession, isOwnPatient, isOwnPlan }
