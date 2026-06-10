import pool from '../db_connection.js';


async function createAppointment(patient_id, doctor_id, scheduled_start, created_by, appointment_type, tenant_id, branch_id) {
  const query = `INSERT INTO appointments (patient_id, doctor_id, scheduled_start, created_by, appointment_type,tenant_id,branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`;
  const values = [patient_id, doctor_id, scheduled_start, created_by, appointment_type, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  return rows[0];
}

async function getAllAppointments(tenant_id, branch_id) {
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
    JOIN patients  p  ON a.patient_id = p.id AND a.tenant_id = p.tenant_id
    JOIN doctors   d  ON a.doctor_id = d.id AND a.tenant_id = d.tenant_id AND a.branch_id = d.branch_id
    JOIN profiles  pr ON d.id = pr.user_id
    WHERE a.tenant_id = $1 AND a.branch_id = $2;`;
  const { rows } = await pool.query(query, [tenant_id, branch_id])
  return rows;
}

async function getAppointment(appointmentId, tenant_id, branch_id, client = pool) {
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
    JOIN patients  p  ON a.patient_id = p.id AND a.tenant_id = p.tenant_id
    JOIN doctors   d  ON a.doctor_id = d.id AND a.tenant_id = d.tenant_id AND a.branch_id = d.branch_id
    JOIN profiles  pr ON d.id = pr.user_id
    WHERE a.id = $1 AND a.tenant_id = $2 AND a.branch_id = $3;
  `;
  const values = [appointmentId, tenant_id, branch_id];
  const { rows } = await client.query(query, values);
  return rows[0];
}

async function updateAppointment(appointmentId, fields, updatedBy, tenant_id, branch_id) {
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
     WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} AND branch_id = $${keys.length + 3}
     RETURNING *;
  `;

  const allValues = [...values, appointmentId, tenant_id, branch_id];
  const { rows } = await pool.query(query, allValues);
  return rows[0] || null;
}

async function deleteAppointment(appointmentId, tenant_id, branch_id) {

  const query = `DELETE FROM appointments WHERE id=$1 AND tenant_id = $2 AND branch_id = $3 RETURNING *`;
  const values = [appointmentId, tenant_id, branch_id]
  const { rows } = await pool.query(query, values);
  return rows[0];
}
// END OF CRUD 

// Checking availability for doctor
async function isDoctorSlotTakenExact(doctor_id, scheduled_start, tenant_id, branch_id) {
  const query = `
    SELECT 1
    FROM appointments
    WHERE doctor_id = $1
      AND status NOT IN ('cancelled', 'no_show','completed')
      AND scheduled_start = $2
      AND tenant_id = $3
      AND branch_id = $4
    LIMIT 1;
  `;
  const values = [doctor_id, scheduled_start, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  return rows.length > 0; // true = slot already taken
}

// ABS: SQL function used to remove the minus sign, 
// so it doesn’t matter whether the existing appointment time is before or after the requested time.
// EXTRACT: SQL function used to extract a specific value from a date/time or interval.
// EPOCH: a field inside EXTRACT that converts the time difference (interval) into the total duration in seconds.
async function isDoctorAvailableInOneHourWindow(doctor_id, scheduled_start, tenant_id, branch_id) {
  const query = `
        SELECT 1
        FROM appointments
        WHERE doctor_id = $1
          AND status NOT IN ('cancelled', 'no_show','completed')
          AND ABS(EXTRACT(EPOCH FROM (scheduled_start - $2))) < 3600
          AND tenant_id = $3
          AND branch_id = $4
        LIMIT 1;
    `;
  const values = [doctor_id, scheduled_start, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);

  return rows.length === 0;
}

async function isDoctorSlotTakenExactForUpdate(doctor_id, scheduled_start, appointmentId, tenant_id, branch_id) {
  // <> like != means (not equal)
  const query = `
    SELECT 1
      FROM appointments
     WHERE doctor_id = $1
       AND id <> $3
       AND status NOT IN ('cancelled', 'no_show','completed')
       AND scheduled_start = $2
       AND tenant_id = $4
       AND branch_id = $5
     LIMIT 1;
  `;
  const values = [doctor_id, scheduled_start, appointmentId, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  return rows.length > 0; // true = some other appointment already at that exact time
}

async function isDoctorAvailableInOneHourWindowForUpdate(
  doctor_id,
  scheduled_start,
  appointmentId,
  tenant_id,
  branch_id
) {
  const query = `
    SELECT 1
      FROM appointments
     WHERE doctor_id = $1
       AND id <> $3
       AND status NOT IN ('cancelled', 'no_show','completed')
       AND ABS(EXTRACT(EPOCH FROM (scheduled_start - $2))) < 3600
       AND tenant_id = $4
       AND branch_id = $5
     LIMIT 1;
  `;
  const values = [doctor_id, scheduled_start, appointmentId, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  // true = NO conflicting appointment found
  return rows.length === 0;
}
// END OF CHECKING AVAILABILITY



// STATUS CHANGING 
async function setAppointmentCheckIn(appointmentId, userId, tenant_id, branch_id) {
  const query = `
    UPDATE appointments
       SET status='checked_in', check_in_time=NOW(), updated_by=$2
     WHERE id=$1 AND status='scheduled' AND tenant_id = $3 AND branch_id = $4
     RETURNING *`;
  const values = [appointmentId, userId, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}

async function setAppointmentStart(appointmentId, userId, tenant_id, branch_id) {
  const query = `
    UPDATE appointments
       SET status='in_progress', started_at=NOW(), updated_by=$2
     WHERE id=$1 AND status='checked_in' AND tenant_id = $3 AND branch_id = $4
     RETURNING *`;
  const values = [appointmentId, userId, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}

async function setAppointmentComplete(appointmentId, doctorId, tenant_id, branch_id, client = pool) {
  const query = `
    UPDATE appointments
       SET status='completed', finished_at=NOW(), updated_by=$2
     WHERE id=$1 AND status='in_progress' AND tenant_id = $3 AND branch_id = $4
     RETURNING *`;
  const values = [appointmentId, doctorId, tenant_id, branch_id];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

async function setAppointmentCancel(appointmentId, userId, cancel_reason, tenant_id, branch_id) {
  const query = `
    UPDATE appointments
       SET status='cancelled', cancel_reason=$3, updated_by=$2
     WHERE id=$1 AND status IN ('scheduled','checked_in') AND tenant_id = $4 AND branch_id = $5
     RETURNING *`;
  const values = [appointmentId, userId, cancel_reason, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}

async function setAppointmentNoShow(appointmentId, userId, cancel_reason, tenant_id, branch_id) {
  const query = `
    UPDATE appointments
       SET status='no_show', cancel_reason=$3, updated_by=$2
     WHERE id=$1 AND status='scheduled' AND tenant_id = $4 AND branch_id = $5
     RETURNING *`;
  const values = [appointmentId, userId, cancel_reason, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}
// NED OF STATUS CHANGING


// for filtters and searches by type and p.name, p.phone and d.name DYNAMIC
async function findAppointmentsWithFilters({ from, to, type, search, page, limit }, tenant_id, branch_id) {
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
      a.appointment_type,
      COUNT(*) OVER() AS total_count
    FROM appointments a
    JOIN patients  p  ON a.patient_id = p.id AND a.tenant_id = p.tenant_id
    JOIN doctors   d  ON a.doctor_id = d.id AND a.tenant_id = d.tenant_id AND a.branch_id = d.branch_id
    JOIN profiles  pr ON d.id = pr.user_id
    WHERE a.tenant_id = $1 AND a.branch_id = $2 `;

  const where = [];
  const values = [tenant_id, branch_id];
  let idx = 3;

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

  const safePage = Math.max(1, page || 1);
  const safeLimit = limit || 20;
  const offset = (safePage - 1) * safeLimit;
  query += ` LIMIT $${idx} OFFSET $${idx + 1}`;
  values.push(safeLimit, offset);

  const { rows } = await pool.query(query, values);
  const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
  return { rows: rows.map(({ total_count, ...rest }) => rest), total };
}

// for dashboard
async function activeTodayAppt({ from, to }, tenant_id, branch_id) {
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
      AND a.tenant_id = $3 AND a.branch_id = $4
     ORDER BY
    CASE a.status
      WHEN 'in_progress' THEN 1
      WHEN 'checked_in' THEN 2
      WHEN 'scheduled'  THEN 3
      ELSE 6
    END,
    a.scheduled_start DESC
  `;
  const values = [from, to, tenant_id, branch_id];
  const { rows } = await pool.query(query, values);
  return rows;
}

async function getSessionByApptId(appointmentId, tenant_id, branch_id) {
  const query = ` SELECT id AS session_id, appointment_id, created_at FROM sessions WHERE appointment_id = $1 AND tenant_id = $2 AND branch_id = $3 LIMIT 1; `;
  const value = [appointmentId, tenant_id, branch_id];
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
  isDoctorSlotTakenExact,
  isDoctorAvailableInOneHourWindow,
  isDoctorSlotTakenExactForUpdate,
  isDoctorAvailableInOneHourWindowForUpdate,
  findAppointmentsWithFilters,
  activeTodayAppt,
  getSessionByApptId
};