import pool from '../db_connection.js';
import appError from '../utils/appError.js';




async function getActivePlan(patientId, type, tenant_id, branch_id, client = pool) {
  const query = ` SELECT *
                    FROM treatment_plans
                    WHERE patient_id = $1
                        AND type = $2
                        AND tenant_id = $3
                        AND branch_id = $4
                        AND status = 'active'
                        AND is_deleted = false
                    ORDER BY created_at DESC
                    LIMIT 1`;
  const values = [patientId, type, tenant_id, branch_id];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

// All active plans of a type for a patient (a patient may have several of the
// same type running in parallel, e.g. two separate RCTs). Includes the tooth
// number(s) so the doctor can recognise WHICH treatment a plan is, instead of
// relying on a plan id.
async function getActivePlans(patientId, type, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT tp.id, tp.type, tp.agreed_total, tp.total_paid, tp.is_paid, tp.is_completed, tp.status, tp.created_at, tp.currency_code,
      (SELECT string_agg(DISTINCT sw.tooth_number::text, ', ' ORDER BY sw.tooth_number::text)
         FROM session_works sw
         WHERE sw.treatment_plan_id = tp.id
           AND sw.tenant_id = tp.tenant_id
           AND sw.branch_id = tp.branch_id
           AND sw.is_deleted = false
           AND sw.tooth_number IS NOT NULL) AS teeth
    FROM treatment_plans tp
    WHERE tp.patient_id = $1
      AND tp.type = $2
      AND tp.tenant_id = $3
      AND tp.branch_id = $4
      AND tp.status = 'active'
      AND tp.is_deleted = false
    ORDER BY tp.created_at ASC`;
  const { rows } = await client.query(query, [patientId, type, tenant_id, branch_id]);
  return rows;
}

async function createPlan({ patientId, type, agreedTotal, createdBy }, tenant_id, branch_id, client = pool) {
  const query = ` INSERT INTO treatment_plans
                    (patient_id, type, agreed_total, created_by,tenant_id,branch_id)
                    VALUES ($1, $2, $3, $4,$5,$6) RETURNING *`;
  const values = [patientId, type, agreedTotal, createdBy, tenant_id, branch_id];
  const { rows } = await client.query(query, values);
  return rows[0] || null;

}


async function getTreatmentPlanByIdForUpdate(planId, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT *
    FROM treatment_plans
    WHERE id = $1
    AND tenant_id = $2
    AND branch_id = $3
    AND is_deleted = false
    FOR UPDATE
  `;
  const { rows } = await client.query(query, [planId, tenant_id, branch_id]);
  return rows[0] || null;
}

async function markCompleted(planId, tenant_id, branch_id, client = pool) {
  const query = `
    UPDATE treatment_plans
    SET
      is_completed = true,
      status = 'completed',
      updated_at = NOW()
    WHERE id = $1
    AND tenant_id = $2
    AND branch_id = $3
    RETURNING *;

  `;
  const { rows } = await client.query(query, [planId, tenant_id, branch_id]);
  return rows[0] || null;
}

async function getSessionsForTp(tpId, tenant_id, branch_id) {
  const query = `
    SELECT
  s.id AS session_id,
  s.next_plan,
  s.notes,
  a.finished_at,

  COALESCE(SUM(tpp.amount), 0) AS paid_for_this_plan_in_this_session,
  string_agg(NULLIF(tpp.note, ''), ' | ' ORDER BY tpp.created_at) AS payment_note
FROM sessions s
JOIN appointments a 
  ON a.id = s.appointment_id
  AND a.tenant_id = s.tenant_id
  AND a.branch_id = s.branch_id

-- relation discovery (ONLY to link session ↔ plan)
JOIN (
  SELECT DISTINCT session_id
  FROM session_works
  WHERE treatment_plan_id = $1
  AND tenant_id = $2
  AND branch_id = $3
  AND is_deleted = false
) rel
  ON rel.session_id = s.id

-- money table (safe to sum now)
LEFT JOIN treatment_payments tpp
  ON tpp.session_id = s.id
 AND tpp.treatment_plan_id = $1
 AND tpp.tenant_id = $2
 AND tpp.branch_id = $3
 AND tpp.is_deleted = false
GROUP BY
  s.id, s.next_plan, s.notes, a.finished_at
ORDER BY a.finished_at DESC NULLS LAST;`;
  const value = [tpId, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows;
}

async function getAllTreatmentPlansForSection({ isPaid, isCompleted, search, page, limit }, tenant_id, branch_id) {
  const baseQuery = `
    SELECT
        tp.id,
        tp.patient_id,
        tp.type,
        tp.agreed_total,
        COALESCE(tp.total_paid, 0) AS total_paid,
        GREATEST(tp.agreed_total - COALESCE(tp.total_paid, 0), 0) AS remaining,
        tp.is_paid,
        tp.is_completed,
        tp.status,
        tp.created_at,
        tp.currency_code,

        p.name AS patient_name,
        COUNT(*) OVER() AS total_count
    FROM treatment_plans tp
    JOIN patients p ON p.id = tp.patient_id  AND p.tenant_id = tp.tenant_id
    WHERE tp.tenant_id = $1
    AND tp.branch_id = $2
    AND tp.is_deleted = false`;

  const where = [];
  const values = [tenant_id, branch_id];
  let idx = 3;

  if (isPaid !== undefined && isPaid !== null) {
    where.push(`tp.is_paid = $${idx}`);
    values.push(isPaid);
    idx++;
  }

  // Completed filter: must allow true OR false
  if (isCompleted !== undefined && isCompleted !== null) {
    where.push(`tp.is_completed = $${idx}`);
    values.push(isCompleted);
    idx++;
  }
  if (search && search.trim()) {
    where.push(`(p.name ILIKE $${idx} OR p.phone ILIKE $${idx} OR array_to_string(p.extra_phones, ' ') ILIKE $${idx})`);
    values.push(`%${search.trim()}%`);
    idx++;
  }
  let query = baseQuery;
  if (where.length > 0) {
    query += ` AND ` + where.join(" AND ");
  }

  query += `
ORDER BY
  CASE
    WHEN tp.is_paid = false AND tp.is_completed = false THEN 1
    WHEN tp.is_paid = false AND tp.is_completed = true THEN 2
    WHEN tp.is_paid = true  AND tp.is_completed = false THEN 3
    WHEN tp.is_paid = true  AND tp.is_completed = true THEN 4
    ELSE 5
  END,
  tp.created_at DESC
  `;

  const safePage = Math.max(1, page || 1);
  const safeLimit = limit || 20;
  const offset = (safePage - 1) * safeLimit;
  query += ` LIMIT $${idx} OFFSET $${idx + 1}`;
  values.push(safeLimit, offset);

  const { rows } = await pool.query(query, values);
  const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
  return { rows: rows.map(({ total_count, ...rest }) => rest), total };
}

// Edit a LIVE plan. Fields left undefined keep their value; is_paid is always
// recomputed from the (possibly new) agreed_total so it can never go stale.
async function editTp(tpId, { type, agreed_total, is_completed, status }, tenant_id, branch_id, client = pool) {
  const query = `
    UPDATE treatment_plans tp
       SET type = COALESCE($1, type),
           agreed_total = COALESCE($2, agreed_total),
           is_completed = COALESCE($3, is_completed),
           status = COALESCE($4, status),
           is_paid = (COALESCE($2, agreed_total) <= total_paid),
           updated_at = NOW()
     WHERE tp.id = $5 AND tp.tenant_id = $6 AND tp.branch_id = $7 AND tp.is_deleted = false
     RETURNING *;
  `;
  const { rows } = await client.query(query, [type ?? null, agreed_total ?? null, is_completed ?? null, status ?? null, tpId, tenant_id, branch_id]);
  return rows[0] || null;
}

// Void a plan only if nothing live is left in it (no works, no payments) — used
// after its last work was removed or moved, so empty plans don't linger.
async function voidPlanIfEmpty(tpId, deletedBy, tenant_id, branch_id, client = pool) {
  const { rows } = await client.query(
    `UPDATE treatment_plans tp
        SET is_deleted = true, deleted_at = NOW(), deleted_by = $2
      WHERE tp.id = $1 AND tp.tenant_id = $3 AND tp.branch_id = $4 AND tp.is_deleted = false
        AND NOT EXISTS (SELECT 1 FROM session_works sw WHERE sw.treatment_plan_id = tp.id AND sw.is_deleted = false)
        AND NOT EXISTS (SELECT 1 FROM treatment_payments p WHERE p.treatment_plan_id = tp.id AND p.is_deleted = false)
      RETURNING *`,
    [tpId, deletedBy, tenant_id, branch_id]
  );
  return rows[0] || null;
}

// Void (soft-delete) a treatment plan. Instead of DELETE, we flag the plan and
// everything hanging off it — its session_works and its treatment_payments — as
// is_deleted=true, stamped with who/when. Nothing leaves the database, so history
// is kept and the action is reversible; but every normal read hides these rows,
// so the plan disappears from the screens and its money drops out of the reports.
// All three tables flip together in one transaction (all-or-nothing).
async function voidTp(tpId, deletedBy, tenant_id, branch_id) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) the plan itself — RETURNING tells the service if a live plan was hit
    const planRes = await client.query(
      `UPDATE treatment_plans
          SET is_deleted = true, deleted_at = NOW(), deleted_by = $1
        WHERE id = $2 AND tenant_id = $3 AND branch_id = $4 AND is_deleted = false
        RETURNING *`,
      [deletedBy, tpId, tenant_id, branch_id]
    );

    // 2) its work rows inside sessions
    await client.query(
      `UPDATE session_works
          SET is_deleted = true, deleted_at = NOW(), deleted_by = $1
        WHERE treatment_plan_id = $2 AND tenant_id = $3 AND branch_id = $4 AND is_deleted = false`,
      [deletedBy, tpId, tenant_id, branch_id]
    );

    // 3) its money ledger
    await client.query(
      `UPDATE treatment_payments
          SET is_deleted = true, deleted_at = NOW(), deleted_by = $1
        WHERE treatment_plan_id = $2 AND tenant_id = $3 AND branch_id = $4 AND is_deleted = false`,
      [deletedBy, tpId, tenant_id, branch_id]
    );

    await client.query("COMMIT");
    return planRes.rows[0] || null;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export default {
  getActivePlan, getActivePlans, createPlan, getTreatmentPlanByIdForUpdate, markCompleted, getSessionsForTp, getAllTreatmentPlansForSection,
  editTp, voidTp, voidPlanIfEmpty
}



