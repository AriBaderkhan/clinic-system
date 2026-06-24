import pool from '../db_connection.js';


async function createPatient(name, phone, age, gender, address, allergies, blood_type, chronic_diseases, created_by, tenant_id, branch_id) {
  const query = `INSERT INTO patients (name,phone,age,gender,address,allergies,blood_type,chronic_diseases,created_by,tenant_id,branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *;`;
  const values = [name, phone, age, gender, address, allergies, blood_type, chronic_diseases, created_by, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}

// async function getAllPatients(q) {
//     const query = `SELECT id,name,phone,age,gender,address,created_by,updated_by FROM patients`;
//     const { rows } = await pool.query(query);
//     return rows;
// }

async function getAllPatients({ q, page, limit } = {}, tenant_id, branch_id) {
  let query = `
    SELECT p.id, p.name, p.phone, p.age, p.gender, p.address, p.created_by, p.updated_by,
           COUNT(*) OVER() AS total_count
FROM patients p
WHERE p.tenant_id = $1
  AND (
    p.branch_id = $2
    OR EXISTS (
      SELECT 1
      FROM patient_branch_access pba
      WHERE pba.tenant_id = p.tenant_id
        AND pba.patient_id = p.id
        AND pba.branch_id = $2
    )
  )
  `;

  const values = [tenant_id, branch_id];
  let idx = 3;

  if (q) {
    query += ` AND (p.name ILIKE $${idx} OR p.phone ILIKE $${idx})`;
    values.push(`%${q}%`);
    idx++;
  }

  query += ` ORDER BY p.name ASC`;

  const safePage = Math.max(1, page || 1);
  const safeLimit = limit || 20;
  const offset = (safePage - 1) * safeLimit;
  query += ` LIMIT $${idx} OFFSET $${idx + 1}`;
  values.push(safeLimit, offset);

  const { rows } = await pool.query(query, values);
  const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
  return { rows: rows.map(({ total_count, ...rest }) => rest), total };
}

async function getPatient(patientId, tenant_id, branch_id) {
  const query = `
  SELECT p.id, p.name, p.phone, p.age, p.gender, p.address,
         p.allergies, p.blood_type, p.chronic_diseases,
         p.created_by, p.updated_by
FROM patients p
WHERE p.id = $1
  AND p.tenant_id = $2
  AND (
    p.branch_id = $3
    OR EXISTS (
      SELECT 1
      FROM patient_branch_access pba
      WHERE pba.tenant_id = p.tenant_id
        AND pba.patient_id = p.id
        AND pba.branch_id = $3
    )
  )
LIMIT 1;
  `;
  const value = [patientId, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows[0] || null;
}

async function updatePatient(patientId, fields, updatedBy, tenant_id, branch_id) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);

  if (keys.length === 0) throw new Error("No fields provided");

  keys.push("updated_by");
  values.push(updatedBy);

  const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(", ");

  const query = `UPDATE patients SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} AND (
  branch_id = $${keys.length + 3}
  OR EXISTS (
    SELECT 1
    FROM patient_branch_access pba
    WHERE pba.tenant_id = patients.tenant_id
      AND pba.patient_id = patients.id
      AND pba.branch_id = $${keys.length + 3}
  )
) RETURNING *;`;
  const allValues = [...values, patientId, tenant_id, branch_id];
  const { rows } = await pool.query(query, allValues);
  return rows[0] || null;
}

async function deletePatient(patientId, tenant_id, branch_id) {
  const query = `DELETE FROM patients WHERE id=$1 AND tenant_id = $2 AND (
  branch_id = $3
  OR EXISTS (
    SELECT 1
    FROM patient_branch_access pba
    WHERE pba.tenant_id = patients.tenant_id
      AND pba.patient_id = patients.id
      AND pba.branch_id = $3
  )
)RETURNING *;`;
  const value = [patientId, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows[0] || null;
}

// for search available patient in creating appointment
async function searchPatientsModel(q, tenant_id, branch_id) {
  const like = `%${q}%`;
  const query = `
      SELECT id, name, phone
      FROM patients p
      WHERE p.tenant_id = $2 
      AND (
        p.branch_id = $3
        OR EXISTS (
          SELECT 1
          FROM patient_branch_access pba
          WHERE pba.tenant_id = p.tenant_id
            AND pba.patient_id = p.id
            AND pba.branch_id = $3
        )
      ) AND
      (p.name ILIKE $1 OR p.phone ILIKE $1)
      ORDER BY p.name ASC
      LIMIT 20;
    `;
  const value = [like, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows;

}


// For Patient Folder
async function getAllApptsPatient(patientId, tenant_id, branch_id) {
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
    JOIN patients p
      ON p.id = a.patient_id
     AND p.tenant_id = a.tenant_id
    JOIN profiles pr  ON pr.user_id = a.doctor_id
    JOIN profiles pr2 ON pr2.user_id = a.created_by
    WHERE a.patient_id = $1
      AND a.tenant_id = $2
      AND a.branch_id = $3
ORDER BY a.scheduled_start DESC;
`;
  const value = [patientId, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows;
}

async function getAllSessionsPatient(patientId, tenant_id, branch_id, limit = null) {
  const query = `
    SELECT 
        s.id AS session_id,
        s.next_plan,
        s.notes,
        s.total,
        s.total_paid,
        s.is_paid,
        s.currency_code,
        s.created_at,

        a.id AS appointment_id,
        a.scheduled_start,
        a.status,

        pr.full_name AS doctor_name,
        p.name AS patient_name,
        p.phone AS patient_phone,
        pr2.full_name AS created_by_name
    FROM sessions s
    JOIN appointments a ON s.appointment_id = a.id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
    JOIN patients p ON a.patient_id = p.id AND p.tenant_id = a.tenant_id 
    JOIN profiles pr ON a.doctor_id= pr.user_id 
    JOIN profiles pr2 ON s.created_by= pr2.user_id 
    WHERE a.patient_id=$1
    AND a.tenant_id = $2
    AND a.branch_id = $3
    ORDER BY s.created_at DESC
    ${limit ? 'LIMIT $4' : ''}`;
  const value = limit ? [patientId, tenant_id, branch_id, limit] : [patientId, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows;
}

async function getAllPaymentsPatient(patientId, tenant_id, branch_id) {
  const query = `
    SELECT 
        sp.id AS payment_id,
        sp.amount,
        sp.method,
        sp.note,
        sp.currency_code,
        sp.created_at,

        s.id AS session_id,
        s.total,
        s.total_paid,
        pr.full_name AS doctor_name,
        p.name AS patient_name,
        pr2.full_name AS processed_by
    FROM session_payments sp
    JOIN sessions s ON sp.session_id = s.id
    JOIN appointments a ON s.appointment_id = a.id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
    JOIN patients p ON a.patient_id = p.id AND p.tenant_id = a.tenant_id 
    JOIN profiles pr ON a.doctor_id= pr.user_id 
    JOIN profiles pr2 ON s.created_by= pr2.user_id 
    WHERE a.patient_id=$1
    AND a.tenant_id = $2
    AND a.branch_id = $3
    ORDER BY sp.created_at DESC`;
  const value = [patientId, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows;
}


async function getAllTreatmentPlansPatient(patientId, tenant_id, branch_id) {
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
        currency_code,
        created_at
    FROM treatment_plans
    WHERE patient_id = $1 AND tenant_id = $2 AND branch_id = $3
    ORDER BY created_at DESC`;
  const value = [patientId, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows;
}

export default {
  createPatient, getAllPatients, getPatient, updatePatient, deletePatient,
  searchPatientsModel, getAllApptsPatient, getAllSessionsPatient, getAllPaymentsPatient,
  getAllTreatmentPlansPatient
}