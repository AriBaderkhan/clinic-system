import pool from '../db_connection.js';

async function addDoc(doc_id, room) {
  const query = `INSERT INTO doctors (id,room) VALUES ($1,$2) RETURNING *`;
  const values = [doc_id, room];
  const { rows } = await pool.query(query, values)
  return rows[0] || null;

}

async function getDoctorById(doctor_id) {
  const query = `Select id FROM doctors WHERE id=$1`;
  const value = [doctor_id];
  const { rows } = await pool.query(query, value)
  return rows[0] || null;
}

async function getAllDocs() {
  const query = `SELECT d.id,d.room, p.full_name
       FROM doctors d 
       JOIN profiles p ON d.id = p.user_id 
       ORDER BY p.full_name ASC;
    `;
  const { rows } = await pool.query(query);
  return rows;
}

async function getDoc(doc_id) {
  const query = `SELECT *
       FROM doctors 
       where id = $1;
    `;
  const value = [doc_id]
  const { rows } = await pool.query(query, value);
  return rows[0] || null;
}

async function activeTodayAppt({ from, to, doc_id }) {
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
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors   d  ON a.doctor_id = d.id
    JOIN profiles  pr ON d.id = pr.user_id
    WHERE a.scheduled_start >= $1
      AND a.scheduled_start <  $2
      AND a.status IN ('scheduled','checked_in','in_progress')
      AND a.doctor_id=$3
     ORDER BY
    CASE a.status
      WHEN 'in_progress' THEN 1
      WHEN 'checked_in' THEN 2
      WHEN 'scheduled'  THEN 3
      ELSE 6
    END,
    a.scheduled_start DESC
  `;
  const values = [from, to, doc_id]
  const { rows } = await pool.query(query, values);
  return rows;
}

async function findApptsPerDoctorWithFilters({ from, to, type, search, doc_id }) {
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
    JOIN patients  p  ON a.patient_id = p.id
    JOIN doctors   d  ON a.doctor_id = d.id
    JOIN profiles  pr ON a.doctor_id = pr.user_id`;

  const where = [];
  const values = [];
  let idx = 1;

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
    query += ` WHERE ` + where.join(" AND ");
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

async function getSessionByApptIdPerDoc(appointmentId, doc_id) {
  const query = ` SELECT s.id AS session_id, s.appointment_id, a.doctor_id 
  FROM sessions s
  JOIN appointments a ON a.id = s.appointment_id
  WHERE appointment_id = $1
  AND a.doctor_id= $2; `;
  const values = [appointmentId, doc_id];
  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}

export default {
  addDoc, getDoctorById, getAllDocs, activeTodayAppt, getDoc,
  findApptsPerDoctorWithFilters, getSessionByApptIdPerDoc
}