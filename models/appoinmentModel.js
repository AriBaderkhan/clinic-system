import pool from '../db_connection.js';


async function createAppointment(patient_id, doctor_id, scheduled_start, created_by, appointment_type) {
  const query = `INSERT INTO appointments (patient_id, doctor_id, scheduled_start, created_by, appointment_type) VALUES ($1,$2,$3,$4,$5) RETURNING *`;
  const values = [patient_id, doctor_id, scheduled_start, created_by, appointment_type];
  const { rows } = await pool.query(query, values);
  return rows[0];
}

async function getAllAppointments() {
  const query = `
    SELECT 
      a.id,
      p.name  AS patient_name,
      p.phone AS patient_phone,
      pr.full_name AS doctor_name,
      a.scheduled_start,
      a.status,
      a.appointment_type
    FROM appointments a
    JOIN patients  p  ON a.patient_id = p.id
    JOIN doctors   d  ON a.doctor_id = d.id
    JOIN profiles  pr ON d.id = pr.user_id;`;
  const { rows } = await pool.query(query)
  return rows;
}

async function getAppointment(appointmentId,client = pool) {
  const query = `
    SELECT 
      a.id,
      a.patient_id,
      a.doctor_id,
      p.name  AS patient_name,
      p.phone AS patient_phone,
      pr.full_name AS doctor_name,
      a.scheduled_start,
      a.status,
      a.check_in_time,
      a.started_at,
      a.finished_at,
      a.cancel_reason,
      a.appointment_type
    FROM appointments a
    JOIN patients  p  ON a.patient_id = p.id
    JOIN doctors   d  ON a.doctor_id = d.id
    JOIN profiles  pr ON d.id = pr.user_id
    WHERE a.id = $1;
  `;
  const values = [appointmentId];
  const { rows } = await client.query(query, values);
  return rows[0];
}

async function updateAppointment(appointmentId, fields, updatedBy) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);

  if (keys.length === 0) {
    throw createError('NO_FIELDS_TO_UPDATE', 'No fields provided to update');
  }

  // add updated_by column
  keys.push('updated_by');
  values.push(updatedBy);

  const setClause = keys
    .map((key, idx) => `${key} = $${idx + 1}`)
    .join(', ');

  const query = `
    UPDATE appointments
       SET ${setClause},
           updated_at = NOW()
     WHERE id = $${keys.length + 1}
     RETURNING *;
  `;

  const allValues = [...values, appointmentId];
  const { rows } = await pool.query(query, allValues);
  return rows[0] || null;
}

async function deleteAppointment(appointmentId) {

  const query = `DELETE FROM appointments WHERE id=$1 RETURNING *`;
  const values = [appointmentId]
  const { rows } = await pool.query(query, values);
  return rows[0];
}
// END OF CRUD 

// Checking availability for doctor
async function isDoctorSlotTakenExact(doctor_id, scheduled_start) {
  const query = `
    SELECT 1
    FROM appointments
    WHERE doctor_id = $1
      AND status NOT IN ('cancelled', 'no_show','completed')
      AND scheduled_start = $2
    LIMIT 1;
  `;
  const values = [doctor_id, scheduled_start];
  const { rows } = await pool.query(query, values);
  return rows.length > 0; // true = slot already taken
}

// ABS: SQL function used to remove the minus sign, 
// so it doesn’t matter whether the existing appointment time is before or after the requested time.
// EXTRACT: SQL function used to extract a specific value from a date/time or interval.
// EPOCH: a field inside EXTRACT that converts the time difference (interval) into the total duration in seconds.
async function isDoctorAvailableInOneHourWindow(doctor_id, scheduled_start) {
  const query = `
        SELECT 1
        FROM appointments
        WHERE doctor_id = $1
          AND status NOT IN ('cancelled', 'no_show','completed')
          AND ABS(EXTRACT(EPOCH FROM (scheduled_start - $2))) < 3600
        LIMIT 1;
    `;
  const values = [doctor_id, scheduled_start];
  const { rows } = await pool.query(query, values);

  return rows.length === 0;
}

async function isDoctorSlotTakenExactForUpdate(doctor_id, scheduled_start, appointmentId) {
  // <> like != means (not equal)
  const query = `
    SELECT 1
      FROM appointments
     WHERE doctor_id = $1
       AND id <> $3
       AND status NOT IN ('cancelled', 'no_show','completed')
       AND scheduled_start = $2
     LIMIT 1;
  `;
  const values = [doctor_id, scheduled_start, appointmentId];
  const { rows } = await pool.query(query, values);
  return rows.length > 0; // true = some other appointment already at that exact time
}

async function isDoctorAvailableInOneHourWindowForUpdate(
  doctor_id,
  scheduled_start,
  appointmentId
) {
  const query = `
    SELECT 1
      FROM appointments
     WHERE doctor_id = $1
       AND id <> $3
       AND status NOT IN ('cancelled', 'no_show','completed')
       AND ABS(EXTRACT(EPOCH FROM (scheduled_start - $2))) < 3600
     LIMIT 1;
  `;
  const values = [doctor_id, scheduled_start, appointmentId];
  const { rows } = await pool.query(query, values);
  // true = NO conflicting appointment found
  return rows.length === 0;
}
// END OF CHECKING AVAILABILITY



// STATUS CHANGING 
async function setAppointmentCheckIn(appointmentId, userId) {
  const query = `
    UPDATE appointments
       SET status='checked_in', check_in_time=NOW(), updated_by=$2
     WHERE id=$1 AND status='scheduled'
     RETURNING *`;
  const values = [appointmentId, userId];
  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}

async function setAppointmentStart(appointmentId, userId) {
  const query = `
    UPDATE appointments
       SET status='in_progress', started_at=NOW(), updated_by=$2
     WHERE id=$1 AND status='checked_in'
     RETURNING *`;
  const values = [appointmentId, userId];
  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}

async function setAppointmentComplete(appointmentId, doctorId,client = pool) {
  const query = `
    UPDATE appointments
       SET status='completed', finished_at=NOW(), updated_by=$2
     WHERE id=$1 AND status='in_progress'
     RETURNING *`;
  const values = [appointmentId, doctorId];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

async function setAppointmentCancel(appointmentId, userId, cancel_reason) {
  const query = `
    UPDATE appointments
       SET status='cancelled', cancel_reason=$3, updated_by=$2
     WHERE id=$1 AND status IN ('scheduled','checked_in')
     RETURNING *`;
  const values = [appointmentId, userId, cancel_reason];
  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}

async function setAppointmentNoShow(appointmentId, userId, cancel_reason) {
  const query = `
    UPDATE appointments
       SET status='no_show', cancel_reason=$3, updated_by=$2
     WHERE id=$1 AND status='scheduled'
     RETURNING *`;
  const values = [appointmentId, userId, cancel_reason];
  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}
// NED OF STATUS CHANGING


// for filtters and searches by type and p.name, p.phone and d.name DYNAMIC
async function findAppointmentsWithFilters({ from, to, type, search }) {
  const baseQuery = `
    SELECT 
      a.id,
      a.doctor_id,
      a.patient_id,
      
      p.name  AS patient_name,
      p.phone AS patient_phone,
      pr.full_name AS doctor_name,
      a.scheduled_start,
      a.status,
      a.appointment_type
    FROM appointments a
    JOIN patients  p  ON a.patient_id = p.id
    JOIN doctors   d  ON a.doctor_id = d.id
    JOIN profiles  pr ON d.id = pr.user_id `;

    const where = [];
    const values = [];
    let idx = 1;

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
        `(p.name ILIKE $${idx} OR p.phone ILIKE $${idx} OR pr.full_name ILIKE $${idx})`
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

// for dashboard
async function activeTodayAppt({ from, to }) {
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
     ORDER BY
    CASE a.status
      WHEN 'in_progress' THEN 1
      WHEN 'checked_in' THEN 2
      WHEN 'scheduled'  THEN 3
      ELSE 6
    END,
    a.scheduled_start DESC
  `;
  const values = [from, to]
  const { rows } = await pool.query(query, values);
  return rows;
}

async function getSessionByApptId(appointmentId) {
  const query = ` SELECT id AS session_id, appointment_id, created_at FROM sessions WHERE appointment_id = $1 LIMIT 1; `;
  const value = [appointmentId];
  const { rows } = await pool.query(query, value);
  return rows[0] || null; 
}

export default {
  createAppointment,
  getAllAppointments,
  getAppointment,
  deleteAppointment,
  updateAppointment,
  setAppointmentCheckIn,
  setAppointmentStart,
  setAppointmentComplete,
  setAppointmentCancel,
  setAppointmentNoShow,
  getPatientAndDoctorByAppointmentId,
  isDoctorSlotTakenExact,
  isDoctorAvailableInOneHourWindow,
  isDoctorSlotTakenExactForUpdate,
  isDoctorAvailableInOneHourWindowForUpdate,
  findAppointmentsWithFilters,
  activeTodayAppt,
  getSessionByApptId
};

async function getPatientAndDoctorByAppointmentId(appointmentId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT patient_id, doctor_id, status FROM appointments WHERE id=$1;`;
    const value = [appointmentId]
    pool.query(query, value, (err, result) => {
      if (err) return reject(err);
      resolve(result.rows[0]);
    })
  })
}

// module.exports = { addAppointment ,  getAllAppointments , getAppointment , deleteAppointmentByID , updateAppointment}