import pool from '../db_connection.js';




async function getActivePlan(patientId, type, tenant_id, branch_id, client = pool) {
  const query = ` SELECT * 
                    FROM treatment_plans
                    WHERE patient_id = $1
                        AND type = $2
                        AND tenant_id = $3
                        AND branch_id = $4
                        AND status = 'active'
                    ORDER BY created_at DESC 
                    LIMIT 1`;
  const values = [patientId, type, tenant_id, branch_id];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
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

  COALESCE(SUM(tpp.amount), 0) AS paid_for_this_plan_in_this_session
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
) rel
  ON rel.session_id = s.id

-- money table (safe to sum now)
LEFT JOIN treatment_payments tpp
  ON tpp.session_id = s.id
 AND tpp.treatment_plan_id = $1
 AND tpp.tenant_id = $2
 AND tpp.branch_id = $3
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

        p.name AS patient_name,
        COUNT(*) OVER() AS total_count
    FROM treatment_plans tp
    JOIN patients p ON p.id = tp.patient_id  AND p.tenant_id = tp.tenant_id
    WHERE tp.tenant_id = $1
    AND tp.branch_id = $2`;

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
    where.push(`p.name ILIKE $${idx}`);
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

async function editTp(tpId, fields, tenant_id, branch_id) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);

  if (keys.length === 0) throw new Error("No fields provided");

  // optional: allow only specific fields (protect from random keys)
  const allowed = new Set(["type", "agreed_total", "is_completed", "status"]);
  for (const k of keys) {
    if (!allowed.has(k)) throw new Error(`Field not allowed: ${k}`);
  }

  const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(", ");

  // --- IMPORTANT RULE ---
  // If agreed_total is provided, it must be >= total_paid
  // const agreedIndex = keys.indexOf("agreed_total"); // -1 if not provided
  // const agreedCheck = agreedIndex === -1
  //   ? "" // no rule needed
  //   : ` AND $${agreedIndex + 1} >= tp.total_paid`;

  const query = `
    UPDATE treatment_plans tp
    SET ${setClause},

     updated_at = NOW()
    WHERE tp.id = $${keys.length + 1}
    AND tp.tenant_id = $${keys.length + 2}
    AND tp.branch_id = $${keys.length + 3}
    RETURNING *;
  `;

  const allValues = [...values, tpId, tenant_id, branch_id];
  const { rows } = await pool.query(query, allValues);
  return rows[0] || null;
}

async function deleteTp(tpId, tenant_id, branch_id) {
  const query = `DELETE FROM treatment_plans WHERE id=$1 AND tenant_id = $2 AND branch_id = $3 RETURNING *;`;
  const value = [tpId, tenant_id, branch_id];
  const { rows } = await pool.query(query, value);
  return rows[0] || null;
}

// async function updatePaidForTpSession(tpId, sessionId, amount,tenant_id,branch_id) {
//   const query = `
//     UPDATE treatment_payments
//     SET amount = $1, created_at = NOW()
//     WHERE treatment_plan_id = $2 AND session_id = $3 AND tenant_id = $4 AND branch_id = $5
//     RETURNING *;
//   `;

//   const { rows } = await pool.query(query, [amount, tpId, sessionId,tenant_id,branch_id]);
//   return rows[0] || null;
// }

async function updatePaidForTpSession(tpId, sessionId, amount, tenant_id, branch_id) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) update if exists
    const upd = await client.query(
      `
      UPDATE treatment_payments
      SET amount = $1
      WHERE treatment_plan_id = $2 AND session_id = $3 AND tenant_id = $4 AND branch_id = $5
      RETURNING *;
      `,
      [amount, tpId, sessionId, tenant_id, branch_id]
    );

    // 2) if not exists, insert
    let paymentRow = upd.rows[0];
    if (!paymentRow) {
      const ins = await client.query(
        `
        INSERT INTO treatment_payments (treatment_plan_id, session_id, amount,tenant_id,branch_id)
        VALUES ($1, $2, $3,$4,$5)
        RETURNING *;
        `,
        [tpId, sessionId, amount, tenant_id, branch_id]
      );
      paymentRow = ins.rows[0];
    }

    // 3) recalc tp.total_paid from treatment_payments
    const sumRes = await client.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS total_paid
      FROM treatment_payments
      WHERE treatment_plan_id = $1 AND tenant_id = $2 AND branch_id = $3;
      `,
      [tpId, tenant_id, branch_id]
    );

    const newTotalPaid = Number(sumRes.rows[0].total_paid || 0);

    // 4) update treatment_plans.total_paid
    await client.query(
      `
      UPDATE treatment_plans
SET
  total_paid = $1,
  is_paid = ($1 >= agreed_total),
  updated_at = NOW()
WHERE id = $2 AND tenant_id = $3 AND branch_id = $4;

      `,
      [newTotalPaid, tpId, tenant_id, branch_id]
    );

    await client.query("COMMIT");

    return {
      payment: paymentRow,
      tp_total_paid: newTotalPaid,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}


export default {
  getActivePlan, createPlan, getTreatmentPlanByIdForUpdate, markCompleted, getSessionsForTp, getAllTreatmentPlansForSection,
  editTp, deleteTp, updatePaidForTpSession
}



