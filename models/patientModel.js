import pool  from '../db_connection.js';


async function createPatient(name, phone, age, gender, address, created_by) {
    const query = `INSERT INTO patients (name,phone,age,gender,address,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *;`;
    const values = [name, phone, age, gender, address, created_by];
    const { rows } = await pool.query(query, values);
    return rows[0] || null;
}

// async function getAllPatients(q) {
//     const query = `SELECT id,name,phone,age,gender,address,created_by,updated_by FROM patients`;
//     const { rows } = await pool.query(query);
//     return rows;
// }

async function getAllPatients(q) {
  let query = `
    SELECT id, name, phone, age, gender, address, created_by, updated_by
    FROM patients
  `;

  const values = [];

  if (q) {
    query += `
      WHERE name ILIKE $1
         OR phone ILIKE $1
    `;
    values.push(`%${q}%`);
  }

  const { rows } = await pool.query(query, values);
  return rows;
}

async function getPatient(patientId) {
    const query = `SELECT id,name,phone,age,gender,address,created_by,updated_by FROM patients WHERE id=$1`;
    const value = [patientId];
    const { rows } = await pool.query(query, value);
    return rows[0] || null;
}

async function updatePatient(patientId, fields, updatedBy) {
    const keys = Object.keys(fields);
    const values = Object.values(fields);

    if (keys.length === 0) throw new Error("No fields provided");

    keys.push("updated_by");
    values.push(updatedBy);

    const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(", ");

    const query = `UPDATE patients SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *;`;
    const allValues = [...values, patientId];
    const { rows } = await pool.query(query, allValues);
    return rows[0] || null;
}

async function deletePatient(patientId) {
    const query = `DELETE FROM patients WHERE id=$1 RETURNING *;`;
    const value = [patientId];
    const { rows } = await pool.query(query, value);
    return rows[0] || null;
}

// for search available patient in creating appointment
async function searchPatientsModel(q) {
    const like = `%${q}%`;
    const query = `
      SELECT id, name, phone
      FROM patients
      WHERE name ILIKE $1
         OR phone ILIKE $1
      ORDER BY name ASC
      LIMIT 20;
    `;
    const value = [like];
    const {rows} = await pool.query(query, value);
    return rows;

  }


  // For Patient Folder
  async function getAllApptsPatient(patientId) {
    const query = `
    SELECT 
        a.id AS appointment_id,
        a.scheduled_start,
        a.status,

        pr.full_name AS doctor_name,
        p.name AS patient_name,
        p.phone AS patient_phone,
        pr2.full_name AS created_by_name
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN profiles pr ON a.doctor_id= pr.user_id
    JOIN profiles pr2 ON a.created_by= pr2.user_id
    WHERE patient_id=$1
    ORDER BY a.scheduled_start DESC`;
    const value = [patientId];
    const { rows } = await pool.query(query, value);
    return rows;
}

  async function getAllSessionsPatient(patientId) {
    const query = `
    SELECT 
        s.id AS session_id,
        s.next_plan,
        s.notes,
        s.total,
        s.total_paid,
        s.is_paid,
        s.created_at,

        a.id AS appointment_id,
        a.scheduled_start,
        a.status,

        pr.full_name AS doctor_name,
        p.name AS patient_name,
        p.phone AS patient_phone,
        pr2.full_name AS created_by_name
    FROM sessions s
    JOIN appointments a ON s.appointment_id = a.id
    JOIN patients p ON a.patient_id = p.id
    JOIN profiles pr ON a.doctor_id= pr.user_id
    JOIN profiles pr2 ON s.created_by= pr2.user_id
    WHERE a.patient_id=$1
    ORDER BY s.created_at DESC`;
    const value = [patientId];
    const { rows } = await pool.query(query, value);
    return rows;
}

  async function getAllPaymentsPatient(patientId) {
    const query = `
    SELECT 
        sp.id AS payment_id,
        sp.amount,
        sp.method,
        sp.note,
        sp.created_at,

        s.id AS session_id,
        s.total,
        s.total_paid,
        pr.full_name AS doctor_name,
        p.name AS patient_name,
        pr2.full_name AS processed_by
    FROM session_payments sp
    JOIN sessions s ON sp.session_id = s.id
    JOIN appointments a ON s.appointment_id = a.id
    JOIN patients p ON a.patient_id = p.id
    JOIN profiles pr ON a.doctor_id= pr.user_id
    JOIN profiles pr2 ON s.created_by= pr2.user_id
    WHERE a.patient_id=$1
    ORDER BY sp.created_at DESC`;
    const value = [patientId];
    const { rows } = await pool.query(query, value);
    return rows;
}


 async function getAllTreatmentPlansPatient(patientId) {
    const query = `
    SELECT
        id,
        patient_id,
        type,
        agreed_total,
        COALESCE(total_paid, 0) AS total_paid,
        (agreed_total - COALESCE(total_paid, 0)) AS remaining,
        is_paid,
        is_completed,
        status,
        created_at
    FROM treatment_plans
    WHERE patient_id = $1
    ORDER BY created_at DESC`;
    const value = [patientId];
    const { rows } = await pool.query(query, value);
    return rows;
}

export default { createPatient, getAllPatients, getPatient, updatePatient, deletePatient,
    searchPatientsModel, getAllApptsPatient, getAllSessionsPatient,getAllPaymentsPatient,
getAllTreatmentPlansPatient }