import pool from '../db_connection.js';

async function addDoc(doc_id, room, tenant_id, branch_id) {
  const query = `INSERT INTO doctors (id,room,tenant_id,branch_id) VALUES ($1,$2,$3,$4) RETURNING *`;
  const values = [doc_id, room, tenant_id, branch_id];
  const { rows } = await pool.query(query, values)
  return rows[0] || null;

}

async function getDoctorById(doctor_id, tenant_id, branch_id) {
  const query = `Select id FROM doctors WHERE id=$1 AND tenant_id=$2 AND branch_id=$3`;
  const value = [doctor_id, tenant_id, branch_id];
  const { rows } = await pool.query(query, value)
  return rows[0] || null;
}

async function getAllDocs(tenant_id, branch_id) {
  const query = `SELECT d.id,d.room, p.full_name
       FROM doctors d
       JOIN profiles p ON d.id = p.user_id
       JOIN users u ON d.id = u.id
       WHERE d.tenant_id = $1 AND d.branch_id = $2 AND u.is_active = true
       ORDER BY p.full_name ASC;
    `;
  const { rows } = await pool.query(query, [tenant_id, branch_id]);
  return rows;
}

async function getDoc(doc_id, tenant_id, branch_id) {
  const query = `SELECT *
       FROM doctors 
       where id = $1 AND tenant_id = $2 AND branch_id = $3;
    `;
  const value = [doc_id, tenant_id, branch_id]
  const { rows } = await pool.query(query, value);
  return rows[0] || null;
}

async function activeTodayAppt({ from, to, doc_id, tenant_id, branch_id }) {
  const query = `
    SELECT 
      a.id,
      a.patient_id,
      a.doctor_id,
      a.status,
      a.appointment_type,
      a.scheduled_start,
      p.name  AS patient_name,
      p.phone AS patient_phone,
      pr.full_name AS doctor_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id AND a.tenant_id = p.tenant_id
    JOIN doctors   d  ON a.doctor_id = d.id AND a.tenant_id = d.tenant_id AND a.branch_id = d.branch_id
    JOIN profiles  pr ON d.id = pr.user_id
    WHERE a.scheduled_start >= $1
      AND a.scheduled_start <  $2
      AND a.status IN ('scheduled','checked_in','in_progress')
      AND a.doctor_id=$3
      AND a.tenant_id = $4
      AND a.branch_id = $5
     ORDER BY
    CASE a.status
      WHEN 'in_progress' THEN 1
      WHEN 'checked_in' THEN 2
      WHEN 'scheduled'  THEN 3
      ELSE 6
    END,
    a.scheduled_start DESC
  `;
  const values = [from, to, doc_id, tenant_id, branch_id]
  const { rows } = await pool.query(query, values);
  return rows;
}

async function findApptsPerDoctorWithFilters({ from, to, type, search, doc_id }, tenant_id, branch_id) {
  const baseQuery = `
    SELECT 
      a.id,
      p.name  AS patient_name,
      p.phone AS patient_phone,
      pr.full_name AS doctor_name,
      a.scheduled_start,
      a.status,
      a.doctor_id,
      a.appointment_type
    FROM appointments a
    JOIN patients  p  ON a.patient_id = p.id AND a.tenant_id = p.tenant_id
    JOIN doctors   d  ON a.doctor_id = d.id AND a.tenant_id = d.tenant_id AND a.branch_id = d.branch_id
    JOIN profiles  pr ON a.doctor_id = pr.user_id
    WHERE a.tenant_id = $1 AND a.branch_id = $2
    `;

  const where = [];
  const values = [tenant_id, branch_id];
  let idx = 3;

  if (doc_id) {
    where.push(`a.doctor_id = $${idx}`);
    values.push(doc_id);
    idx++;
  }
  if (from) {
    where.push(`a.scheduled_start >= $${idx}`);
    values.push(from);
    idx++;
  }

  if (to) {
    where.push(`a.scheduled_start < $${idx}`);
    values.push(to);
    idx++;
  }

  if (type) {
    where.push(`a.appointment_type = $${idx}`);
    values.push(type);
    idx++;
  }
  if (search) {
    where.push(
      `(p.name ILIKE $${idx} OR p.phone ILIKE $${idx} )`
    );
    values.push(`%${search}%`);
    idx++;
  }

  let query = baseQuery;
  if (where.length > 0) {
    query += ` AND ` + where.join(" AND ");
  }

  query += `
  ORDER BY
    CASE a.status
      WHEN 'in_progress' THEN 1
      WHEN 'checked_in' THEN 2
      WHEN 'scheduled'  THEN 3
      WHEN 'completed'  THEN 4
      WHEN 'cancelled'  THEN 5
      WHEN 'no_show'    THEN 5
      ELSE 6
    END,
    a.scheduled_start DESC
`;

  const { rows } = await pool.query(query, values);
  return rows;
}

async function getSessionByApptIdPerDoc(appointmentId, doc_id, tenant_id, branch_id) {
  const query = ` SELECT s.id AS session_id, s.appointment_id, a.doctor_id 
  FROM sessions s
  JOIN appointments a ON a.id = s.appointment_id AND a.tenant_id = s.tenant_id AND a.branch_id = s.branch_id
  WHERE s.appointment_id = $1
  AND a.doctor_id= $2
  AND s.tenant_id = $3
  AND s.branch_id = $4; `;
  const values = [appointmentId, doc_id, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}

export default {
  addDoc, getDoctorById, getAllDocs, activeTodayAppt, getDoc,
  findApptsPerDoctorWithFilters, getSessionByApptIdPerDoc
}