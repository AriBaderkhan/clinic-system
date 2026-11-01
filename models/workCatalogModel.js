import pool from '../db_connection.js';

async function createWork(code, name, min_price, allow_installments, min_installment_amount, tenant_id, branch_id, is_active, is_plan, is_whole_mouth, specialty_id, client = pool) {
  const query = `
    INSERT INTO work_catalog (code, name, min_price, allow_installments, min_installment_amount, tenant_id, branch_id, is_active, is_plan, is_whole_mouth, specialty_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id,code,name
  `;
  const values = [code, name, min_price, allow_installments, min_installment_amount, tenant_id, branch_id, is_active, is_plan, is_whole_mouth, specialty_id];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}
    
async function getWorks(tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, code, name, min_price, allow_installments, min_installment_amount, is_active, is_plan, is_whole_mouth, specialty_id
    FROM work_catalog
    WHERE tenant_id = $1
    AND branch_id = $2
    AND is_active = true
    ORDER BY name ASC
  `;
  const { rows } = await client.query(query, [tenant_id, branch_id]);
  return rows;
}

async function getWorkById(id, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, code, name, min_price, allow_installments, min_installment_amount, is_active, is_plan, is_whole_mouth, specialty_id
    FROM work_catalog
    WHERE id = $1
    AND tenant_id = $2
    AND branch_id = $3
  `;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}

async function getWorksByIds(ids, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, code, name, min_price, allow_installments, min_installment_amount, is_active, is_plan, is_whole_mouth, specialty_id
    FROM work_catalog
    WHERE id = ANY($1::int[])
    AND tenant_id = $2
    AND branch_id = $3
  `;
  const { rows } = await client.query(query, [ids, tenant_id, branch_id]);
  return rows;
}

async function getWorkByType(type, tenant_id, branch_id, client = pool) {
  // Only ACTIVE works count as duplicates — a soft-deleted code can be re-added.
  const query = `
    SELECT id, code, name, min_price, allow_installments, min_installment_amount
    FROM work_catalog
    WHERE code = $1
    AND tenant_id = $2
    AND branch_id = $3
    AND is_active = true
  `;
  const { rows } = await client.query(query, [type, tenant_id, branch_id]);
  return rows[0] || null;
}

async function updateWork(workId, fields, tenant_id, branch_id, client = pool) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);

  const setClause = keys
    .map((key, idx) => `${key} = $${idx + 1}`)
    .join(', ');

  const query = `
    UPDATE work_catalog
       SET ${setClause}
     WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} AND branch_id = $${keys.length + 3}
     RETURNING *;
  `;

  const allValues = [...values, workId, tenant_id, branch_id];
  const { rows } = await client.query(query, allValues);
  return rows[0] || null;
}


async function deleteWork(id, tenant_id, branch_id, client = pool) {
  const query = `
    UPDATE work_catalog
    SET is_active = false
    WHERE id = $1
    AND tenant_id = $2
    AND branch_id = $3
    RETURNING id
  `;
  const { rows } = await client.query(query, [id, tenant_id, branch_id]);
  return rows[0] || null;
}
// A work is allowed for a doctor when: the work has no specialty, the doctor has
// no specialty, both share the same specialty, or the manager ticked it as an
// extra for this doctor.
const ALLOWED_FOR_DOCTOR = `
  (wc.specialty_id IS NULL OR d.specialty_id IS NULL OR wc.specialty_id = d.specialty_id
   OR EXISTS (SELECT 1 FROM doctor_extra_works x
               WHERE x.doctor_id = d.id AND x.work_id = wc.id
                 AND x.tenant_id = wc.tenant_id AND x.branch_id = wc.branch_id))`;

// active treatments this doctor may use (the visit window list)
async function getWorksForDoctor(doctor_id, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT wc.id, wc.code, wc.name, wc.min_price, wc.allow_installments, wc.min_installment_amount,
           wc.is_active, wc.is_plan, wc.is_whole_mouth, wc.specialty_id
      FROM work_catalog wc
      JOIN doctors d ON d.id = $1 AND d.tenant_id = wc.tenant_id AND d.branch_id = wc.branch_id
     WHERE wc.tenant_id = $2 AND wc.branch_id = $3 AND wc.is_active = true
       AND ${ALLOWED_FOR_DOCTOR}
     ORDER BY wc.name ASC`;
  const { rows } = await client.query(query, [doctor_id, tenant_id, branch_id]);
  return rows;
}

// which of these work ids the doctor may use
async function getAllowedWorkIds(doctor_id, work_ids, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT wc.id
      FROM work_catalog wc
      JOIN doctors d ON d.id = $1 AND d.tenant_id = wc.tenant_id AND d.branch_id = wc.branch_id
     WHERE wc.id = ANY($2::int[]) AND wc.tenant_id = $3 AND wc.branch_id = $4
       AND ${ALLOWED_FOR_DOCTOR}`;
  const { rows } = await client.query(query, [doctor_id, work_ids, tenant_id, branch_id]);
  return rows.map(r => Number(r.id));
}

export default {
  getWorksForDoctor,
  getAllowedWorkIds,
  createWork,
  getWorks,
  getWorkById,
  getWorksByIds,
  getWorkByType,
  updateWork,
  deleteWork
};