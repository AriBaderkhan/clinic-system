import pool from '../db_connection.js';

// ── Templates (reuse reminder_templates, scoped to type='feedback') ──────────
async function getTemplate(tenant_id, branch_id, client = pool) {
  const query = `
    SELECT kur_msg, arb_msg, eng_msg
    FROM reminder_templates
    WHERE tenant_id = $1 AND branch_id = $2 AND type = 'feedback'`;
  const { rows } = await client.query(query, [tenant_id, branch_id]);
  return rows[0] || null;
}

async function upsertTemplate(tenant_id, branch_id, body, updated_by, client = pool) {
  const query = `
    INSERT INTO reminder_templates (tenant_id, branch_id, type, kur_msg, arb_msg, eng_msg, updated_by)
    VALUES ($1, $2, 'feedback', $3, $4, $5, $6)
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

// The clinic (tenant) name in each language — used to fill {clinic_name} in the
// message per language. Falls back to the base name when a language is unset.
async function getClinicNames(tenant_id, client = pool) {
  const { rows } = await client.query(
    `SELECT
       COALESCE(name_ku, name) AS ku,
       COALESCE(name_ar, name) AS ar,
       COALESCE(name_en, name) AS en
     FROM tenants WHERE id = $1`,
    [tenant_id],
  );
  const r = rows[0] || {};
  return { ku: r.ku || '', ar: r.ar || '', en: r.en || '' };
}

// ── Feedback list: ONE row per patient who has a completed appointment and no
//    feedback yet. Newest completed appointment first. Paginated.
//    (A patient with 100 completed appts appears once.)
async function getPatientsNeedingFeedback(tenant_id, branch_id, limit, offset, client = pool) {
  const query = `
    SELECT sub.*, COUNT(*) OVER() AS total_count
    FROM (
      SELECT DISTINCT ON (a.patient_id)
        a.patient_id,
        a.id             AS appointment_id,   -- representative (the latest) appointment
        a.scheduled_start AS latest_start,
        p.name           AS patient_name,
        p.phone          AS patient_phone
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id AND a.tenant_id = p.tenant_id
      WHERE a.tenant_id = $1
        AND a.branch_id = $2
        AND a.status = 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM feedbacks f
          WHERE f.patient_id = a.patient_id AND f.tenant_id = $1 AND f.branch_id = $2
        )
      ORDER BY a.patient_id, a.scheduled_start DESC
    ) sub
    ORDER BY sub.latest_start DESC
    LIMIT $3 OFFSET $4;`;
  const { rows } = await client.query(query, [tenant_id, branch_id, limit, offset]);
  const total = rows.length ? Number(rows[0].total_count) : 0;
  return { rows, total };
}

// Has this patient already been handled (sent OR dismissed) in this branch?
async function existsForPatient(tenant_id, branch_id, patient_id, client = pool) {
  const query = `
    SELECT 1 FROM feedbacks
    WHERE tenant_id = $1 AND branch_id = $2 AND patient_id = $3
    LIMIT 1`;
  const { rows } = await client.query(query, [tenant_id, branch_id, patient_id]);
  return rows.length > 0;
}

// ── Create an invite (status='sent') → returns its token, or dismiss it. ──────
async function insertInvite(entry, client = pool) {
  const query = `
    INSERT INTO feedbacks
      (tenant_id, branch_id, patient_id, appointment_id, source, status, token, language, sent_by)
    VALUES ($1, $2, $3, $4, $5, 'sent', $6, $7, $8)
    RETURNING id, token`;
  const values = [
    entry.tenant_id, entry.branch_id, entry.patient_id, entry.appointment_id ?? null,
    entry.source, entry.token, entry.language, entry.sent_by,
  ];
  const { rows } = await client.query(query, values);
  return rows[0];
}

async function insertDismissal(entry, client = pool) {
  const query = `
    INSERT INTO feedbacks
      (tenant_id, branch_id, patient_id, appointment_id, source, status, sent_by)
    VALUES ($1, $2, $3, $4, $5, 'dismissed', $6)
    RETURNING id`;
  const values = [
    entry.tenant_id, entry.branch_id, entry.patient_id, entry.appointment_id ?? null,
    entry.source, entry.sent_by,
  ];
  const { rows } = await client.query(query, values);
  return rows[0];
}

// ── Public form (no auth) ────────────────────────────────────────────────────
async function getByToken(token, client = pool) {
  const query = `
    SELECT
      f.id, f.status, f.submitted_at,
      p.name AS patient_name,
      COALESCE(t.name_ku, t.name) AS clinic_name_ku,
      COALESCE(t.name_ar, t.name) AS clinic_name_ar,
      COALESCE(t.name_en, t.name) AS clinic_name_en,
      b.name AS branch_name
    FROM feedbacks f
    JOIN patients p ON f.patient_id = p.id
    JOIN tenants  t ON f.tenant_id  = t.id
    JOIN branches b ON f.branch_id  = b.id
    WHERE f.token = $1
    LIMIT 1`;
  const { rows } = await client.query(query, [token]);
  return rows[0] || null;
}

async function submitByToken(token, r, client = pool) {
  const query = `
    UPDATE feedbacks SET
      submitted_at        = NOW(),
      form_language       = $2,
      anonymous           = $3,
      overall_rating      = $4,
      doctor_rating       = $5,  doctor_comment      = $6,
      staff_rating        = $7,  staff_comment       = $8,
      cleanliness_rating  = $9,  cleanliness_comment = $10,
      cost_rating         = $11, cost_comment        = $12,
      note                = $13
    WHERE token = $1 AND submitted_at IS NULL
    RETURNING id`;
  const values = [
    token, r.form_language, r.anonymous,
    r.overall_rating,
    r.doctor_rating, r.doctor_comment,
    r.staff_rating, r.staff_comment,
    r.cleanliness_rating, r.cleanliness_comment,
    r.cost_rating, r.cost_comment,
    r.note,
  ];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

// ── Results (tenant_manager) — TENANT-WIDE, so the page can switch branches ──

// Every submitted response across the tenant, tagged with its branch.
async function getTenantResponses(tenant_id, client = pool) {
  const query = `
    SELECT
      f.id, f.branch_id, b.name AS branch_name,
      f.submitted_at, f.form_language, f.anonymous,
      CASE WHEN f.anonymous THEN NULL ELSE p.name END AS patient_name,
      f.overall_rating,
      f.doctor_rating,      f.doctor_comment,
      f.staff_rating,       f.staff_comment,
      f.cleanliness_rating, f.cleanliness_comment,
      f.cost_rating,        f.cost_comment,
      f.note
    FROM feedbacks f
    JOIN patients p ON f.patient_id = p.id
    JOIN branches b ON f.branch_id  = b.id
    WHERE f.tenant_id = $1 AND f.submitted_at IS NOT NULL
    ORDER BY f.submitted_at DESC;`;
  const { rows } = await client.query(query, [tenant_id]);
  return rows;
}

// Tenant-wide averages/counts (the "All branches" view).
async function getOverallSummary(tenant_id, client = pool) {
  const query = `
    SELECT
      COUNT(*) FILTER (WHERE status = 'sent')          AS invites_sent,
      COUNT(*) FILTER (WHERE submitted_at IS NOT NULL) AS responses,
      ROUND(AVG(overall_rating),     2) AS avg_overall,
      ROUND(AVG(doctor_rating),      2) AS avg_doctor,
      ROUND(AVG(staff_rating),       2) AS avg_staff,
      ROUND(AVG(cleanliness_rating), 2) AS avg_cleanliness,
      ROUND(AVG(cost_rating),        2) AS avg_cost
    FROM feedbacks
    WHERE tenant_id = $1;`;
  const { rows } = await client.query(query, [tenant_id]);
  return rows[0];
}

// One summary row per branch (all branches, even ones with no feedback yet).
async function getBranchSummaries(tenant_id, client = pool) {
  const query = `
    SELECT
      b.id AS branch_id, b.name AS branch_name,
      COUNT(f.id) FILTER (WHERE f.status = 'sent')          AS invites_sent,
      COUNT(f.id) FILTER (WHERE f.submitted_at IS NOT NULL) AS responses,
      ROUND(AVG(f.overall_rating),     2) AS avg_overall,
      ROUND(AVG(f.doctor_rating),      2) AS avg_doctor,
      ROUND(AVG(f.staff_rating),       2) AS avg_staff,
      ROUND(AVG(f.cleanliness_rating), 2) AS avg_cleanliness,
      ROUND(AVG(f.cost_rating),        2) AS avg_cost
    FROM branches b
    LEFT JOIN feedbacks f ON f.branch_id = b.id AND f.tenant_id = b.tenant_id
    WHERE b.tenant_id = $1
    GROUP BY b.id, b.name
    ORDER BY b.name;`;
  const { rows } = await client.query(query, [tenant_id]);
  return rows;
}

export default {
  getTemplate, upsertTemplate, getClinicNames,
  getPatientsNeedingFeedback, existsForPatient,
  insertInvite, insertDismissal,
  getByToken, submitByToken,
  getTenantResponses, getOverallSummary, getBranchSummaries,
};
