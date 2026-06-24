import pool from '../db_connection.js';

// Prescriptions live INSIDE the appointment-complete flow (create) and the
// session flow (view/edit). These helpers are called with the caller's
// transaction client so they join the same atomic operation.

// Get an appointment's prescription + drug lines (or null).
async function getByAppointment(appointment_id, tenant_id, branch_id, client = pool) {
  const head = await client.query(
    `SELECT id, appointment_id, doctor_id, created_at
     FROM prescriptions
     WHERE appointment_id = $1 AND tenant_id = $2 AND branch_id = $3`,
    [appointment_id, tenant_id, branch_id]
  );
  if (head.rows.length === 0) return null;

  const items = await client.query(
    `SELECT id, drug_name, dosage, frequency, duration, instructions
     FROM prescription_items WHERE prescription_id = $1 ORDER BY id ASC`,
    [head.rows[0].id]
  );
  return { ...head.rows[0], items: items.rows };
}

// Create/replace an appointment's prescription within the caller's transaction.
// Empty list → remove it. Returns nothing (the flow returns its own result).
async function saveForAppointment({ appointment_id, tenant_id, branch_id, doctor_id, items }, client = pool) {
  if (!items || items.length === 0) {
    await client.query(
      `DELETE FROM prescriptions WHERE appointment_id = $1 AND tenant_id = $2 AND branch_id = $3`,
      [appointment_id, tenant_id, branch_id]
    );
    return;
  }

  // find or create the prescription header
  let prescId;
  const existing = await client.query(
    `SELECT id FROM prescriptions WHERE appointment_id = $1 AND tenant_id = $2 AND branch_id = $3`,
    [appointment_id, tenant_id, branch_id]
  );
  if (existing.rows.length > 0) {
    prescId = existing.rows[0].id;
  } else {
    const created = await client.query(
      `INSERT INTO prescriptions (appointment_id, tenant_id, branch_id, doctor_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [appointment_id, tenant_id, branch_id, doctor_id]
    );
    prescId = created.rows[0].id;
  }

  // replace the drug lines
  await client.query(`DELETE FROM prescription_items WHERE prescription_id = $1`, [prescId]);
  for (const it of items) {
    if (!it.drug_name || !it.drug_name.trim()) continue;
    await client.query(
      `INSERT INTO prescription_items
         (prescription_id, drug_name, dosage, frequency, duration, instructions)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [prescId, it.drug_name.trim(), it.dosage || null, it.frequency || null, it.duration || null, it.instructions || null]
    );
  }
}

// Whitelisted fields for autocomplete (column names can't be parameterized).
const SUGGEST_FIELDS = ['drug_name', 'dosage', 'frequency', 'duration'];

// Distinct past values for a field, scoped to the tenant → the clinic builds its
// own vocabulary (typing "w" suggests "Warfarin" it used before).
async function suggest(tenant_id, field, q, client = pool) {
  if (!SUGGEST_FIELDS.includes(field)) return [];
  const query = `
    SELECT DISTINCT pi.${field} AS value
    FROM prescription_items pi
    JOIN prescriptions p ON p.id = pi.prescription_id
    WHERE p.tenant_id = $1
      AND pi.${field} ILIKE $2
      AND pi.${field} IS NOT NULL AND pi.${field} <> ''
    ORDER BY value ASC
    LIMIT 10`;
  const { rows } = await client.query(query, [tenant_id, `${q}%`]);
  return rows.map((r) => r.value);
}

export default { getByAppointment, saveForAppointment, suggest };
