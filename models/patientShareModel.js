import pool from '../db_connection.js';

// Sharing a patient with other branches of the same clinic (patient_branch_access).
// The patient's HOME branch is patients.branch_id.

async function getHome(patient_id, tenant_id) {
    const query = `
    SELECT p.id, p.branch_id, b.name AS branch_name
      FROM patients p
      JOIN branches b ON b.id = p.branch_id
     WHERE p.id = $1 AND p.tenant_id = $2`;
    const { rows } = await pool.query(query, [patient_id, tenant_id]);
    return rows[0] || null;
}

// every branch the patient is shared with: when, from where, by whom
async function listShares(patient_id, tenant_id) {
    const query = `
    SELECT pba.branch_id, b.name AS branch_name, pba.created_at,
           pba.granted_from_branch_id, fb.name AS from_branch_name,
           pr.full_name AS granted_by_name
      FROM patient_branch_access pba
      JOIN branches b       ON b.id = pba.branch_id
      LEFT JOIN branches fb ON fb.id = pba.granted_from_branch_id
      LEFT JOIN profiles pr ON pr.user_id = pba.granted_by
     WHERE pba.patient_id = $1 AND pba.tenant_id = $2
     ORDER BY pba.created_at`;
    const { rows } = await pool.query(query, [patient_id, tenant_id]);
    return rows;
}

// the other ACTIVE branches of the clinic (where a patient could be shared to)
async function getOtherBranches(tenant_id, branch_id) {
    const query = `
    SELECT id, name FROM branches
     WHERE tenant_id = $1 AND id <> $2 AND status = 'active'
     ORDER BY name`;
    const { rows } = await pool.query(query, [tenant_id, branch_id]);
    return rows;
}

async function addShare(tenant_id, patient_id, branch_id, from_branch_id, granted_by) {
    const query = `
    INSERT INTO patient_branch_access (tenant_id, patient_id, branch_id, granted_from_branch_id, granted_by)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tenant_id, branch_id, patient_id) DO NOTHING
    RETURNING id`;
    const { rows } = await pool.query(query, [tenant_id, patient_id, branch_id, from_branch_id, granted_by]);
    return rows[0] || null;
}

async function removeShare(tenant_id, patient_id, branch_id) {
    const query = `DELETE FROM patient_branch_access WHERE tenant_id = $1 AND patient_id = $2 AND branch_id = $3 RETURNING id`;
    const { rows } = await pool.query(query, [tenant_id, patient_id, branch_id]);
    return rows[0] || null;
}

// does the patient have anything in that branch (appointments or treatment plans, even voided ones)?
async function hasRecordsInBranch(patient_id, tenant_id, branch_id) {
    const query = `
    SELECT EXISTS (SELECT 1 FROM appointments WHERE patient_id = $1 AND tenant_id = $2 AND branch_id = $3)
        OR EXISTS (SELECT 1 FROM treatment_plans WHERE patient_id = $1 AND tenant_id = $2 AND branch_id = $3) AS has`;
    const { rows } = await pool.query(query, [patient_id, tenant_id, branch_id]);
    return rows[0].has;
}

// branches (NOT this one) that have a patient with this phone (main or extra) the caller cannot see.
// Only branch names come back — no patient details leave their branch.
async function findPhoneElsewhere(phone, tenant_id, branch_id) {
    const query = `
    SELECT DISTINCT b.id AS branch_id, b.name AS branch_name
      FROM patients p
      JOIN branches b ON b.id = p.branch_id
     WHERE p.tenant_id = $2 AND p.branch_id <> $3
       AND (p.phone = $1 OR $1 = ANY(p.extra_phones))
       AND NOT EXISTS (SELECT 1 FROM patient_branch_access pba
                        WHERE pba.tenant_id = p.tenant_id AND pba.patient_id = p.id AND pba.branch_id = $3)
     ORDER BY b.name`;
    const { rows } = await pool.query(query, [phone, tenant_id, branch_id]);
    return rows;
}

export default { getHome, listShares, getOtherBranches, addShare, removeShare, hasRecordsInBranch, findPhoneElsewhere }
