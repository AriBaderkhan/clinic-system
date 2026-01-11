import pool from '../db_connection.js';




async function getActivePlan(patientId, type, client = pool) {
  const query = ` SELECT * 
                    FROM treatment_plans
                    WHERE patient_id = $1
                        AND type = $2
                        AND status = 'active'
                    ORDER BY created_at DESC 
                    LIMIT 1`;
  const values = [patientId, type];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

async function createPlan({ patientId, type, agreedTotal, createdBy }, client = pool) {
  const query = ` INSERT INTO treatment_plans
                    (patient_id, type, agreed_total, created_by)
                    VALUES ($1, $2, $3, $4) RETURNING *`;
  const values = [patientId, type, agreedTotal, createdBy];
  const { rows } = await client.query(query, values);
  return rows[0] || null;

}


async function getTreatmentPlanByIdForUpdate(planId, client = pool) {
  const query = `
    SELECT *
    FROM treatment_plans
    WHERE id = $1
    FOR UPDATE
  `;
  const { rows } = await client.query(query, [planId]);
  return rows[0] || null;
}

async function markCompleted(planId, client = pool) {
  const query = `
    UPDATE treatment_plans
    SET
      is_completed = true,
      status = 'completed',
      updated_at = NOW()
    WHERE id = $1 RETURNING *;

  `;
  const { rows } = await client.query(query, [planId]);
  return rows[0] || null;
}

async function getSessionsForTp(tpId) {
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

-- relation discovery (ONLY to link session ↔ plan)
JOIN (
  SELECT DISTINCT session_id
  FROM session_works
  WHERE treatment_plan_id = $1
) rel
  ON rel.session_id = s.id

-- money table (safe to sum now)
LEFT JOIN treatment_payments tpp
  ON tpp.session_id = s.id
 AND tpp.treatment_plan_id = $1
GROUP BY
  s.id, s.next_plan, s.notes, a.finished_at
ORDER BY a.finished_at DESC NULLS LAST;`;
  const value = [tpId];
  const { rows } = await pool.query(query, value);
  return rows;
}

async function getAllTreatmentPlansForSection({ isPaid, isCompleted, search }) {
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

        p.name AS patient_name
    FROM treatment_plans tp
    JOIN patients p ON p.id = tp.patient_id`;

  const where = [];
  const values = [];
  let idx = 1;

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
    query += ` WHERE ` + where.join(" AND ");
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

  const { rows } = await pool.query(query, values);
  return rows;
}

async function editTp(tpId, fields) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);

  if (keys.length === 0) throw new Error("No fields provided");

  // optional: allow only specific fields (protect from random keys)
  const allowed = new Set(["type", "agreed_total"]);
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
    RETURNING *;
  `;

  const allValues = [...values, tpId];
  const { rows } = await pool.query(query, allValues);
  return rows[0] || null;
}

async function deleteTp(tpId) {
  const query = `DELETE FROM treatment_plans WHERE id=$1 RETURNING *;`;
  const value = [tpId];
  const { rows } = await pool.query(query, value);
  return rows[0] || null;
}

// async function updatePaidForTpSession(tpId, sessionId, amount) {
//   const query = `
//     UPDATE treatment_payments
//     SET amount = $1, created_at = NOW()
//     WHERE treatment_plan_id = $2 AND session_id = $3
//     RETURNING *;
//   `;

//   const { rows } = await pool.query(query, [amount, tpId, sessionId]);
//   return rows[0] || null;
// }

async function updatePaidForTpSession(tpId, sessionId, amount) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) update if exists
    const upd = await client.query(
      `
      UPDATE treatment_payments
      SET amount = $1
      WHERE treatment_plan_id = $2 AND session_id = $3
      RETURNING *;
      `,
      [amount, tpId, sessionId]
    );

    // 2) if not exists, insert
    let paymentRow = upd.rows[0];
    if (!paymentRow) {
      const ins = await client.query(
        `
        INSERT INTO treatment_payments (treatment_plan_id, session_id, amount)
        VALUES ($1, $2, $3)
        RETURNING *;
        `,
        [tpId, sessionId, amount]
      );
      paymentRow = ins.rows[0];
    }

    // 3) recalc tp.total_paid from treatment_payments
    const sumRes = await client.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS total_paid
      FROM treatment_payments
      WHERE treatment_plan_id = $1;
      `,
      [tpId]
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
WHERE id = $2;

      `,
      [newTotalPaid, tpId]
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



