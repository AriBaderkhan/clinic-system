import pool from '../db_connection.js'


async function getPaymentsHistory() {

    const query = `
    SELECT 
        sp.session_id,
        sp.amount,
        sp.note,
        sp.created_at, 
   
        s.id AS session_id,
    
        p.name  AS patient_name,
        p.phone      AS patient_phone,

        pr.full_name  AS doctor_name,
        pr2.full_name AS processed_by
        FROM session_payments sp
        JOIN sessions s ON s.id=sp.session_id
        JOIN appointments a ON a.id=s.appointment_id
        JOIN patients p ON p.id=a.patient_id
        JOIN doctors d ON d.id=a.doctor_id
        JOIN profiles pr ON pr.user_id=d.id
        JOIN profiles pr2 ON pr2.user_id = sp.created_by
        ORDER BY sp.created_at DESC
    `;
    const { rows } = await pool.query(query);
    return rows;
}


async function getSessionDetails(session_id) {
  const query = `
    SELECT 
      s.id AS session_id,
      s.appointment_id,
      s.min_total,
      s.total,
      s.total_paid,
      s.is_paid,
      s.next_plan,
      s.notes,
      s.created_at,

      sp.note AS payment_note,

      a.started_at  AS appointment_start_time,
      a.finished_at AS appointment_end_time,
      a.status      AS appointment_status,

      p.id    AS patient_id,
      p.name  AS patient_name,
      p.phone AS patient_phone,

      d.id         AS doctor_id,
      pr.full_name AS doctor_name,
      pr2.full_name AS processed_by
    FROM sessions s
    JOIN appointments a ON a.id = s.appointment_id
    JOIN session_payments sp ON sp.session_id = s.id
    JOIN patients p     ON p.id = a.patient_id
    JOIN doctors d      ON d.id = a.doctor_id
    JOIN profiles pr    ON pr.user_id = d.id
    JOIN profiles pr2   ON pr2.user_id = s.created_by
    WHERE s.id = $1
  `;
  const value = [session_id];
  const { rows } = await pool.query(query, value);
  return rows[0] || null;
}

export default { getPaymentsHistory, getSessionDetails }