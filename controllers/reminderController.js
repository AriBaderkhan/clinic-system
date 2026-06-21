import reminderService from '../services/reminderService.js';
import asyncWrap from '../utils/asyncWrap.js';

// GET /api/reminders/upcoming — the 48h list (nearest first), each with a
// ready-to-send message per language and a normalized phone number.
const getUpcoming = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id } = req.user;
  const data = await reminderService.getUpcomingReminders(tenant_id, branch_id);
  res.status(200).json({ ok: true, data });
});

// GET /api/reminders/template — the branch's editable standard template.
const getTemplate = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id } = req.user;
  const data = await reminderService.getTemplate(tenant_id, branch_id);
  res.status(200).json({ ok: true, data });
});

// PUT /api/reminders/template — save edits to the branch template.
const updateTemplate = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id, id: updated_by } = req.user;
  const { kur_msg, arb_msg, eng_msg } = req.body;
  const data = await reminderService.updateTemplate(tenant_id, branch_id, { kur_msg, arb_msg, eng_msg }, updated_by);
  res.status(200).json({ ok: true, data });
});

// POST /api/reminders/:appointmentId/sent — log a sent reminder → it disappears.
const markSent = asyncWrap(async (req, res) => {
  const { tenant_id, branch_id, id: sent_by } = req.user;
  const appointment_id = Number(req.params.appointmentId);
  const { patient_id, language, message } = req.body;

  await reminderService.markSent({
    tenant_id, branch_id, appointment_id, patient_id, language, message, sent_by,
  });
  res.status(201).json({ ok: true });
});

export default { getUpcoming, getTemplate, updateTemplate, markSent };
