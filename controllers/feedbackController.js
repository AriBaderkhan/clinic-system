import feedbackService from '../services/feedbackService.js';
import asyncWrap from '../utils/asyncWrap.js';

// GET /api/feedbacks/template — the branch's editable feedback message.
const getTemplate = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id } = req.user;
  const data = await feedbackService.getTemplate(tenant_id, branch_id);
  res.status(200).json({ ok: true, data });
});

// PUT /api/feedbacks/template
const updateTemplate = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id, id: updated_by } = req.user;
  const { kur_msg, arb_msg, eng_msg } = req.body;
  const data = await feedbackService.updateTemplate(tenant_id, branch_id, { kur_msg, arb_msg, eng_msg }, updated_by);
  res.status(200).json({ ok: true, data });
});

// GET /api/feedbacks/appointments?page&limit — one row per patient needing
// feedback (newest completed appt first), paginated.
const getAppointments = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id } = req.user;
  const { page, limit } = req.query;
  const result = await feedbackService.getPatientsNeedingFeedback(tenant_id, branch_id, page, limit);
  res.status(200).json({ ok: true, data: result.data, pagination: result.pagination });
});

// POST /api/feedbacks/invite — create an invite, returns { token }. It disappears.
const createInvite = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id, id: sent_by } = req.user;
  const { patient_id, appointment_id, source, language } = req.body;
  const data = await feedbackService.createInvite({
    tenant_id, branch_id, patient_id, appointment_id, source, language, sent_by,
  });
  res.status(201).json({ ok: true, data });
});

// POST /api/feedbacks/dismiss — skip without sending. It disappears too.
const dismiss = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id, id: sent_by } = req.user;
  const { patient_id, appointment_id, source } = req.body;
  await feedbackService.dismiss({ tenant_id, branch_id, patient_id, appointment_id, source, sent_by });
  res.status(201).json({ ok: true });
});

// GET /api/feedbacks/results — tenant-wide results (tenant_manager). Returns
// { overall, branches, responses } so the page can switch branches client-side.
const getResults = asyncWrap(async (req, res) => {
  const { tenant_id } = req.user;
  const data = await feedbackService.getTenantResults(tenant_id);
  res.status(200).json({ ok: true, data });
});

// GET /api/feedbacks/qr-link — the ids the branch's static QR encodes.
const getQrLink = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id } = req.user;
  res.status(200).json({ ok: true, data: { tenant_id, branch_id } });
});

// ── Public (no auth) ─────────────────────────────────────────────────────────
const getPublicForm = asyncWrap(async (req, res) => {
  const data = await feedbackService.getPublicForm(req.params.token);
  res.status(200).json({ ok: true, data });
});

const submitPublicForm = asyncWrap(async (req, res) => {
  await feedbackService.submitPublicForm(req.params.token, req.body);
  res.status(201).json({ ok: true });
});

// Public QR form (walk-in, anonymous) — keyed by tenant + branch, no patient.
const getQrForm = asyncWrap(async (req, res) => {
  const data = await feedbackService.getQrForm(Number(req.params.tenantId), Number(req.params.branchId));
  res.status(200).json({ ok: true, data });
});

const submitQrForm = asyncWrap(async (req, res) => {
  await feedbackService.submitQrFeedback(Number(req.params.tenantId), Number(req.params.branchId), req.body);
  res.status(201).json({ ok: true });
});

export default {
  getTemplate, updateTemplate,
  getAppointments, createInvite, dismiss,
  getResults, getQrLink,
  getPublicForm, submitPublicForm,
  getQrForm, submitQrForm,
};
