import pool from '../db_connection.js';
import { CLINIC_TZ } from '../utils/clinicTime.js';

const REMINDER_DAYS = 4; // tomorrow + the 3 days after it

// Appointments that still NEED a reminder:
//   • status = 'scheduled'  → checked_in / in_progress / completed auto-drop
//   • from tomorrow 00:00 to the end of the 4th day, in clinic time
//   • no reminder already sent for it (NOT EXISTS in reminders)
// Ordered nearest-first (tomorrow first).
async function getUpcoming(tenant_id, branch_id, client = pool) {
  const query = `
    SELECT
      a.id            AS appointment_id,
      a.patient_id,
      a.scheduled_start,
      p.name          AS patient_name,
      p.phone         AS patient_phone
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id AND a.tenant_id = p.tenant_id
    WHERE a.tenant_id = $1
      AND a.branch_id = $2
      AND a.is_deleted = false
      AND a.status = 'scheduled'
      AND a.scheduled_start >= (date_trunc('day', NOW() AT TIME ZONE $3) + INTERVAL '1 day') AT TIME ZONE $3
      AND a.scheduled_start <  (date_trunc('day', NOW() AT TIME ZONE $3) + make_interval(days => $4 + 1)) AT TIME ZONE $3
      AND NOT EXISTS (
        SELECT 1 FROM reminders r
         WHERE r.appointment_id = a.id AND r.tenant_id = a.tenant_id AND r.branch_id = a.branch_id
      )
    ORDER BY a.scheduled_start ASC;`;
  const { rows } = await client.query(query, [tenant_id, branch_id, CLINIC_TZ, REMINDER_DAYS]);
  return rows;
}

// Log a sent reminder. Its mere existence hides the appointment from getUpcoming.
async function insertSent(entry, client = pool) {
  const query = `
    INSERT INTO reminders
      (tenant_id, branch_id, appointment_id, patient_id, channel, language, message, sent_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`;
  const values = [
    entry.tenant_id, entry.branch_id, entry.appointment_id, entry.patient_id,
    entry.channel || 'whatsapp', entry.language, entry.message, entry.sent_by,
  ];
  const { rows } = await client.query(query, values);
  return rows[0];
}

// one "reminder sent" at a time per appointment (held until the transaction ends)
async function lockAppointmentReminder(appointment_id, client) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('reminder-sent'), $1::int)`, [appointment_id]);
}

// Has this appointment already been reminded? (guards against double-send.)
async function existsForAppointment(tenant_id, branch_id, appointment_id, client = pool) {
  const query = `
    SELECT 1 FROM reminders
    WHERE tenant_id = $1 AND branch_id = $2 AND appointment_id = $3
    LIMIT 1`;
  const { rows } = await client.query(query, [tenant_id, branch_id, appointment_id]);
  return rows.length > 0;
}

// The branch's editable standard template (one row per branch).
// reminder_templates now holds both 'reminder' and 'feedback' rows, so scope to
// the reminder one explicitly.
async function getTemplate(tenant_id, branch_id, client = pool) {
  const query = `
    SELECT kur_msg, arb_msg, eng_msg
    FROM reminder_templates
    WHERE tenant_id = $1 AND branch_id = $2 AND type = 'reminder'`;
  const { rows } = await client.query(query, [tenant_id, branch_id]);
  return rows[0] || null;
}

// Save edits to the branch template (create the row if it doesn't exist yet).
async function upsertTemplate(tenant_id, branch_id, body, updated_by, client = pool) {
  const query = `
    INSERT INTO reminder_templates (tenant_id, branch_id, type, kur_msg, arb_msg, eng_msg, updated_by)
    VALUES ($1, $2, 'reminder', $3, $4, $5, $6)
    ON CONFLICT (tenant_id, branch_id, type)
    DO UPDATE SET
      kur_msg = EXCLUDED.kur_msg,
      arb_msg = EXCLUDED.arb_msg,
      eng_msg = EXCLUDED.eng_msg,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING kur_msg, arb_msg, eng_msg`;
  const values = [tenant_id, branch_id, body.kur_msg, body.arb_msg, body.eng_msg, updated_by];
  const { rows } = await client.query(query, values);
  return rows[0];
}

export default { getUpcoming, insertSent, existsForAppointment, getTemplate, upsertTemplate, lockAppointmentReminder };
