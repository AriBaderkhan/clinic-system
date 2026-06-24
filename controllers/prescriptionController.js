import prescriptionModel from '../models/prescriptionModel.js';
import asyncWrap from '../utils/asyncWrap.js';

// GET /api/prescriptions/suggest?field=drug_name&q=w
// Read-only autocomplete — the clinic's own past values for a field (per tenant).
// Create/edit of prescriptions happen INSIDE the complete + session flows, not here.
const suggest = asyncWrap(async (req, res) => {
  const { tenant_id } = req.user;
  const { field, q } = req.query;
  if (!q || !String(q).trim()) return res.status(200).json({ ok: true, data: [] });

  const data = await prescriptionModel.suggest(tenant_id, field, String(q).trim());
  res.status(200).json({ ok: true, data });
});

export default { suggest };
