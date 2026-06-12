import pool from '../db_connection.js';

// ===================== LABS =====================

async function createLab(name, phone, tenant_id, branch_id, client = pool) {
  const query = `
    INSERT INTO labs (name, phone, tenant_id, branch_id)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const { rows } = await client.query(query, [name, phone, tenant_id, branch_id]);
  return rows[0] || null;
}

// paginated + search, with treatments count (no N+1)
async function findLabsWithFilters({ search, page, limit }, tenant_id, branch_id) {
  const baseQuery = `
    SELECT
      l.id,
      l.name,
      l.phone,
      l.is_active,
      l.created_at,
      (SELECT COUNT(*) FROM lab_treatments lt WHERE lt.lab_id = l.id) AS treatments_count,
      COUNT(*) OVER() AS total_count
    FROM labs l
    WHERE l.tenant_id = $1 AND l.branch_id = $2 AND l.is_active = true `;

  const where = [];
  const values = [tenant_id, branch_id];
  let idx = 3;

  if (search) {
    where.push(`l.name ILIKE $${idx}`);
    values.push(`%${search}%`);
    idx++;
  }

  let query = baseQuery;
  if (where.length > 0) {
    query += ` AND ` + where.join(' AND ');
  }

  query += ` ORDER BY l.name ASC LIMIT $${idx} OFFSET $${idx + 1}`;
  const safePage = Math.max(1, page || 1);
  const safeLimit = limit || 20;
  values.push(safeLimit, (safePage - 1) * safeLimit);

  const { rows } = await pool.query(query, values);
  const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
  return { rows: rows.map(({ total_count, ...rest }) => rest), total };
}

// lightweight search for the order form autocomplete
async function searchLabs(search, tenant_id, branch_id) {
  const query = `
    SELECT id, name, phone
    FROM labs
    WHERE tenant_id = $1 AND branch_id = $2 AND is_active = true
      AND name ILIKE $3
    ORDER BY name ASC
    LIMIT 10
  `;
  const { rows } = await pool.query(query, [tenant_id, branch_id, `%${search}%`]);
  return rows;
}

async function getLabById(labId, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT id, name, phone, is_active, created_at
    FROM labs
    WHERE id = $1 AND tenant_id = $2 AND branch_id = $3
  `;
  const { rows } = await client.query(query, [labId, tenant_id, branch_id]);
  return rows[0] || null;
}

async function updateLab(labId, fields, tenant_id, branch_id, client = pool) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);

  const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');

  const query = `
    UPDATE labs
       SET ${setClause}
     WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} AND branch_id = $${keys.length + 3}
     RETURNING *
  `;
  const { rows } = await client.query(query, [...values, labId, tenant_id, branch_id]);
  return rows[0] || null;
}

async function deleteLab(labId, tenant_id, branch_id) {
  const query = `
    UPDATE labs
    SET is_active = false
    WHERE id = $1 AND tenant_id = $2 AND branch_id = $3
    RETURNING id
  `;
  const { rows } = await pool.query(query, [labId, tenant_id, branch_id]);
  return rows[0] || null;
}

// ===================== LAB TREATMENTS (price list) =====================

async function getLabTreatments(labId, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT
      lt.id,
      lt.work_id,
      lt.cost,
      wc.name AS work_name,
      wc.code AS work_code
    FROM lab_treatments lt
    JOIN work_catalog wc ON wc.id = lt.work_id AND wc.tenant_id = lt.tenant_id AND wc.branch_id = lt.branch_id
    WHERE lt.lab_id = $1 AND lt.tenant_id = $2 AND lt.branch_id = $3
    ORDER BY wc.name ASC
  `;
  const { rows } = await client.query(query, [labId, tenant_id, branch_id]);
  return rows;
}

// single bulk INSERT for all price list rows
async function bulkCreateLabTreatments(labId, treatments, tenant_id, branch_id, client = pool) {
  const values = [];
  const placeholders = treatments.map((t, i) => {
    const b = i * 5;
    values.push(labId, t.work_id, t.cost, tenant_id, branch_id);
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
  });

  const query = `
    INSERT INTO lab_treatments (lab_id, work_id, cost, tenant_id, branch_id)
    VALUES ${placeholders.join(', ')}
    RETURNING *
  `;
  const { rows } = await client.query(query, values);
  return rows;
}

async function deleteLabTreatments(labId, tenant_id, branch_id, client = pool) {
  const query = `DELETE FROM lab_treatments WHERE lab_id = $1 AND tenant_id = $2 AND branch_id = $3`;
  await client.query(query, [labId, tenant_id, branch_id]);
}

// cost lookup for the order snapshot
async function getLabTreatmentCost(labId, workId, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT cost
    FROM lab_treatments
    WHERE lab_id = $1 AND work_id = $2 AND tenant_id = $3 AND branch_id = $4
  `;
  const { rows } = await client.query(query, [labId, workId, tenant_id, branch_id]);
  return rows[0] || null;
}

// ===================== LAB ORDERS =====================

async function createOrder(orderData, tenant_id, branch_id, client = pool) {
  const { lab_id, appointment_id, patient_id, doctor_id, work_id, quantity, unit_cost, total_cost, notes, created_by } = orderData;
  const query = `
    INSERT INTO lab_orders (lab_id, appointment_id, patient_id, doctor_id, work_id, quantity, unit_cost, total_cost, notes, created_by, tenant_id, branch_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `;
  const values = [lab_id, appointment_id || null, patient_id, doctor_id, work_id, quantity, unit_cost, total_cost, notes, created_by, tenant_id, branch_id];
  const { rows } = await client.query(query, values);
  return rows[0] || null;
}

// paginated + filters (status, lab, search by patient/doctor/lab name)
async function findOrdersWithFilters({ status, lab_id, search, page, limit }, tenant_id, branch_id) {
  const baseQuery = `
    SELECT
      o.id,
      o.lab_id,
      o.appointment_id,
      o.patient_id,
      o.doctor_id,
      o.work_id,
      o.quantity,
      o.unit_cost,
      o.total_cost,
      o.status,
      o.order_date,
      o.ready_date,
      o.delivered_date,
      o.notes,
      l.name AS lab_name,
      p.name AS patient_name,
      p.phone AS patient_phone,
      pr.full_name AS doctor_name,
      wc.name AS work_name,
      COUNT(*) OVER() AS total_count
    FROM lab_orders o
    JOIN labs l ON l.id = o.lab_id AND l.tenant_id = o.tenant_id AND l.branch_id = o.branch_id
    JOIN patients p ON p.id = o.patient_id AND p.tenant_id = o.tenant_id
    JOIN doctors d ON d.id = o.doctor_id AND d.tenant_id = o.tenant_id AND d.branch_id = o.branch_id
    JOIN profiles pr ON pr.user_id = d.id
    JOIN work_catalog wc ON wc.id = o.work_id AND wc.tenant_id = o.tenant_id AND wc.branch_id = o.branch_id
    WHERE o.tenant_id = $1 AND o.branch_id = $2 `;

  const where = [];
  const values = [tenant_id, branch_id];
  let idx = 3;

  if (status) {
    where.push(`o.status = $${idx}`);
    values.push(status);
    idx++;
  }

  if (lab_id) {
    where.push(`o.lab_id = $${idx}`);
    values.push(lab_id);
    idx++;
  }

  if (search) {
    where.push(`(p.name ILIKE $${idx} OR p.phone ILIKE $${idx} OR pr.full_name ILIKE $${idx} OR l.name ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }

  let query = baseQuery;
  if (where.length > 0) {
    query += ` AND ` + where.join(' AND ');
  }

  query += `
  ORDER BY
    CASE o.status
      WHEN 'ordered'   THEN 1
      WHEN 'ready'     THEN 2
      WHEN 'delivered' THEN 3
      WHEN 'cancelled' THEN 4
      ELSE 5
    END,
    o.order_date DESC
  `;

  query += ` LIMIT $${idx} OFFSET $${idx + 1}`;
  const safePage = Math.max(1, page || 1);
  const safeLimit = limit || 20;
  values.push(safeLimit, (safePage - 1) * safeLimit);

  const { rows } = await pool.query(query, values);
  const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
  return { rows: rows.map(({ total_count, ...rest }) => rest), total };
}

async function getOrderById(orderId, tenant_id, branch_id, client = pool) {
  const query = `
    SELECT
      o.*,
      l.name AS lab_name,
      l.phone AS lab_phone,
      p.name AS patient_name,
      p.phone AS patient_phone,
      pr.full_name AS doctor_name,
      wc.name AS work_name,
      pr2.full_name AS created_by_name,
      a.scheduled_start AS appointment_date
    FROM lab_orders o
    JOIN labs l ON l.id = o.lab_id AND l.tenant_id = o.tenant_id AND l.branch_id = o.branch_id
    JOIN patients p ON p.id = o.patient_id AND p.tenant_id = o.tenant_id
    JOIN doctors d ON d.id = o.doctor_id AND d.tenant_id = o.tenant_id AND d.branch_id = o.branch_id
    JOIN profiles pr ON pr.user_id = d.id
    JOIN work_catalog wc ON wc.id = o.work_id AND wc.tenant_id = o.tenant_id AND wc.branch_id = o.branch_id
    LEFT JOIN profiles pr2 ON pr2.user_id = o.created_by
    LEFT JOIN appointments a ON a.id = o.appointment_id AND a.tenant_id = o.tenant_id AND a.branch_id = o.branch_id
    WHERE o.id = $1 AND o.tenant_id = $2 AND o.branch_id = $3
  `;
  const { rows } = await client.query(query, [orderId, tenant_id, branch_id]);
  return rows[0] || null;
}

async function updateOrder(orderId, fields, tenant_id, branch_id, client = pool) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);

  const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');

  const query = `
    UPDATE lab_orders
       SET ${setClause}
     WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} AND branch_id = $${keys.length + 3}
     RETURNING *
  `;
  const { rows } = await client.query(query, [...values, orderId, tenant_id, branch_id]);
  return rows[0] || null;
}

async function setOrderStatus(orderId, status, tenant_id, branch_id) {
  // ready/delivered dates fill automatically the first time each status is reached
  const query = `
    UPDATE lab_orders
       SET status = $2::varchar,
           ready_date     = CASE WHEN $2::varchar = 'ready'     AND ready_date     IS NULL THEN NOW() ELSE ready_date     END,
           delivered_date = CASE WHEN $2::varchar = 'delivered' AND delivered_date IS NULL THEN NOW() ELSE delivered_date END
     WHERE id = $1 AND tenant_id = $3 AND branch_id = $4
     RETURNING *
  `;
  const { rows } = await pool.query(query, [orderId, status, tenant_id, branch_id]);
  return rows[0] || null;
}

async function deleteOrder(orderId, tenant_id, branch_id) {
  const query = `DELETE FROM lab_orders WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 RETURNING id`;
  const { rows } = await pool.query(query, [orderId, tenant_id, branch_id]);
  return rows[0] || null;
}

export default {
  createLab,
  findLabsWithFilters,
  searchLabs,
  getLabById,
  updateLab,
  deleteLab,
  getLabTreatments,
  bulkCreateLabTreatments,
  deleteLabTreatments,
  getLabTreatmentCost,
  createOrder,
  findOrdersWithFilters,
  getOrderById,
  updateOrder,
  setOrderStatus,
  deleteOrder,
};
