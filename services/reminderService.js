import reminderModel from '../models/reminderModel.js';
import appError from '../utils/appError.js';

// Clinic timezone for formatting the date/time inside the message. Iraq = UTC+3.
// (Stored as TIMESTAMPTZ; we format explicitly so it never shows UTC.)
const CLINIC_TZ = 'Asia/Baghdad';

// Turn a raw Iraqi number into E.164 for wa.me. Strip a leading 0 / 964, then
// prepend 964. Valid Iraqi mobile = 10 national digits starting with 7.
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  let national = digits;
  if (national.startsWith('964')) national = national.slice(3);
  else if (national.startsWith('0')) national = national.slice(1);

  const valid = national.length === 10 && national.startsWith('7');
  return { e164: '964' + national, valid };
}

// Kurdish (Sorani) weekday names, keyed by the English weekday.
const KU_WEEKDAYS = {
  Sunday: 'یەکشەممە', Monday: 'دووشەممە', Tuesday: 'سێشەممە',
  Wednesday: 'چوارشەممە', Thursday: 'پێنجشەممە', Friday: 'هەینی', Saturday: 'شەممە',
};

// Format the appointment in the clinic's timezone. Returns one time string and a
// per-language date string that includes the weekday name in that language
// (e.g. "2026-06-24 چوارشەممە" / "2026-06-24 الأربعاء" / "2026-06-24 Wednesday").
function formatDateTime(scheduled_start) {
  const d = new Date(scheduled_start);
  const base = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d); // YYYY-MM-DD
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TZ, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d); // e.g. 3:30 PM

  const enDay = new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TZ, weekday: 'long' }).format(d);
  const arDay = new Intl.DateTimeFormat('ar',    { timeZone: CLINIC_TZ, weekday: 'long' }).format(d);
  const kuDay = KU_WEEKDAYS[enDay] || enDay;

  return {
    time,
    dates: {
      ku: `${base} ${kuDay}`,
      ar: `${base} ${arDay}`,
      en: `${base} ${enDay}`,
    },
  };
}

// Replace {patient_name} {date} {time} in a template string.
function fillTemplate(text, vars) {
  return String(text || '')
    .replaceAll('{patient_name}', vars.patient_name ?? '')
    .replaceAll('{date}', vars.date ?? '')
    .replaceAll('{time}', vars.time ?? '');
}

// Build the 48h reminder list: each appointment with its phone + ready-filled
// message in all three languages, so reception can pick/edit and send.
async function getUpcomingReminders(tenant_id, branch_id) {
  const template = await reminderModel.getTemplate(tenant_id, branch_id);
  if (!template) {
    throw appError('TEMPLATE_NOT_FOUND', 'No reminder template set for this branch', 404);
  }

  const rows = await reminderModel.getUpcoming(tenant_id, branch_id);

  return rows.map((r) => {
    const { dates, time } = formatDateTime(r.scheduled_start);
    const { e164, valid } = normalizePhone(r.patient_phone);
    const name = r.patient_name;

    return {
      appointment_id: r.appointment_id,
      patient_id: r.patient_id,
      patient_name: name,
      phone_raw: r.patient_phone,
      phone: e164,
      phone_valid: valid,
      scheduled_start: r.scheduled_start,
      messages: {
        ku: fillTemplate(template.kur_msg, { patient_name: name, date: dates.ku, time }),
        ar: fillTemplate(template.arb_msg, { patient_name: name, date: dates.ar, time }),
        en: fillTemplate(template.eng_msg, { patient_name: name, date: dates.en, time }),
      },
    };
  });
}

// Read the branch's editable template (for the "Edit template" panel).
async function getTemplate(tenant_id, branch_id) {
  const template = await reminderModel.getTemplate(tenant_id, branch_id);
  if (!template) {
    throw appError('TEMPLATE_NOT_FOUND', 'No reminder template set for this branch', 404);
  }
  return template;
}

// Save edits to the branch template.
async function updateTemplate(tenant_id, branch_id, body, updated_by) {
  return reminderModel.upsertTemplate(tenant_id, branch_id, body, updated_by);
}

// Mark a reminder as sent (logs it → the appointment disappears from the list).
async function markSent({ tenant_id, branch_id, appointment_id, patient_id, language, message, sent_by }) {
  const already = await reminderModel.existsForAppointment(tenant_id, branch_id, appointment_id);
  if (already) throw appError('REMINDER_ALREADY_SENT', 'Reminder already sent for this appointment', 409);

  return reminderModel.insertSent({
    tenant_id, branch_id, appointment_id, patient_id,
    channel: 'whatsapp', language, message, sent_by,
  });
}

export default { getUpcomingReminders, getTemplate, updateTemplate, markSent };
