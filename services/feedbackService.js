import crypto from 'crypto';
import feedbackModel from '../models/feedbackModel.js';
import appError from '../utils/appError.js';

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

// Fill {patient_name} and {clinic_name}; leave {link} intact — the frontend
// swaps {link} for `<origin>/feedback/<token>` after the invite is created.
function fillTemplate(text, patient_name, clinic_name) {
  return String(text || '')
    .replaceAll('{patient_name}', patient_name ?? '')
    .replaceAll('{clinic_name}', clinic_name ?? '');
}

// Each language's message uses the clinic name IN THAT LANGUAGE.
function buildMessages(template, patient_name, clinicNames) {
  return {
    ku: fillTemplate(template.kur_msg, patient_name, clinicNames.ku),
    ar: fillTemplate(template.arb_msg, patient_name, clinicNames.ar),
    en: fillTemplate(template.eng_msg, patient_name, clinicNames.en),
  };
}

async function requireTemplate(tenant_id, branch_id) {
  const template = await feedbackModel.getTemplate(tenant_id, branch_id);
  if (!template) {
    throw appError('FEEDBACK_TEMPLATE_NOT_FOUND', 'No feedback template set for this branch', 404);
  }
  return template;
}

// ── Templates ────────────────────────────────────────────────────────────────
async function getTemplate(tenant_id, branch_id) {
  return requireTemplate(tenant_id, branch_id);
}

async function updateTemplate(tenant_id, branch_id, body, updated_by) {
  return feedbackModel.upsertTemplate(tenant_id, branch_id, body, updated_by);
}

// ── Feedback list (post-appointment, one row per patient, paginated) ─────────
async function getPatientsNeedingFeedback(tenant_id, branch_id, page = 1, limit = 20) {
  const template = await requireTemplate(tenant_id, branch_id);
  const clinicNames = await feedbackModel.getClinicNames(tenant_id);

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const { rows, total } = await feedbackModel.getPatientsNeedingFeedback(tenant_id, branch_id, safeLimit, offset);

  const data = rows.map((r) => {
    const { e164, valid } = normalizePhone(r.patient_phone);
    return {
      patient_id: r.patient_id,
      appointment_id: r.appointment_id,
      patient_name: r.patient_name,
      phone_raw: r.patient_phone,
      phone: e164,
      phone_valid: valid,
      latest_start: r.latest_start,
      messages: buildMessages(template, r.patient_name, clinicNames),
    };
  });

  return {
    data,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1),
    },
  };
}

// ── Create / dismiss invites (keyed per patient) ─────────────────────────────
async function createInvite({ tenant_id, branch_id, patient_id, appointment_id, source, language, sent_by }) {
  const already = await feedbackModel.existsForPatient(tenant_id, branch_id, patient_id);
  if (already) throw appError('FEEDBACK_ALREADY_HANDLED', 'Feedback already handled for this patient', 409);

  const token = crypto.randomUUID();
  const row = await feedbackModel.insertInvite({
    tenant_id, branch_id, patient_id, appointment_id, source: source || 'appointment', token, language, sent_by,
  });
  return { token: row.token };
}

async function dismiss({ tenant_id, branch_id, patient_id, appointment_id, source, sent_by }) {
  const already = await feedbackModel.existsForPatient(tenant_id, branch_id, patient_id);
  if (already) throw appError('FEEDBACK_ALREADY_HANDLED', 'Feedback already handled for this patient', 409);

  return feedbackModel.insertDismissal({
    tenant_id, branch_id, patient_id, appointment_id, source: source || 'appointment', sent_by,
  });
}

// ── Public form (no auth) ────────────────────────────────────────────────────
async function getPublicForm(token) {
  const row = await feedbackModel.getByToken(token);
  if (!row) throw appError('FEEDBACK_LINK_INVALID', 'This feedback link is not valid', 404);
  return {
    clinic_names: { ku: row.clinic_name_ku, ar: row.clinic_name_ar, en: row.clinic_name_en },
    patient_name: row.patient_name,
    already_submitted: !!row.submitted_at,
  };
}

async function submitPublicForm(token, payload) {
  const row = await feedbackModel.getByToken(token);
  if (!row) throw appError('FEEDBACK_LINK_INVALID', 'This feedback link is not valid', 404);
  if (row.submitted_at) throw appError('FEEDBACK_ALREADY_SUBMITTED', 'This feedback was already submitted', 409);

  // Overall = average of the 4 rated categories (rounded to a whole star).
  const four = [payload.doctor_rating, payload.staff_rating, payload.cleanliness_rating, payload.cost_rating];
  const overall_rating = Math.round(four.reduce((a, b) => a + b, 0) / four.length);

  const record = {
    form_language: payload.form_language,
    anonymous: payload.anonymous,
    overall_rating,
    note: payload.note || null,
    doctor_rating: payload.doctor_rating,           doctor_comment: payload.doctor_comment || null,
    staff_rating: payload.staff_rating,             staff_comment: payload.staff_comment || null,
    cleanliness_rating: payload.cleanliness_rating, cleanliness_comment: payload.cleanliness_comment || null,
    cost_rating: payload.cost_rating,               cost_comment: payload.cost_comment || null,
  };

  const saved = await feedbackModel.submitByToken(token, record);
  if (!saved) throw appError('FEEDBACK_ALREADY_SUBMITTED', 'This feedback was already submitted', 409);
  return saved;
}

// ── Results (tenant_manager) — one payload with everything, so the page can
//    switch branches client-side (like the tenant dashboard). ─────────────────
async function getTenantResults(tenant_id) {
  const [overall, branches, responses] = await Promise.all([
    feedbackModel.getOverallSummary(tenant_id),
    feedbackModel.getBranchSummaries(tenant_id),
    feedbackModel.getTenantResponses(tenant_id),
  ]);
  return { overall, branches, responses };
}

export default {
  getTemplate, updateTemplate,
  getPatientsNeedingFeedback,
  createInvite, dismiss,
  getPublicForm, submitPublicForm,
  getTenantResults,
};
