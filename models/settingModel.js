import pool from '../db_connection.js'

async function getEffectiveSettings(tenant_id, branch_id) {
    const query = `
    SELECT
    COALESCE(bs.timezone,ts.timezone) AS timezone,
    COALESCE(bs.currency_code,ts.currency_code) AS currency_code
    FROM branches b
    JOIN tenant_settings ts ON b.tenant_id = ts.tenant_id
    LEFT JOIN branch_settings bs ON b.id = bs.branch_id AND b.tenant_id = bs.tenant_id
    WHERE b.id = $1 AND b.tenant_id = $2
    LIMIT 1
    `
    const result = await pool.query(query, [branch_id, tenant_id])
    return result.rows[0]
}

// The branch's workflow switches. A branch with no row gets the defaults
// (= how the system always worked).
async function getWorkflow(tenant_id, branch_id, client = pool) {
    const query = `
    SELECT
      COALESCE(w.allow_settle_unpaid, true)    AS allow_settle_unpaid,
      COALESCE(w.allow_discounts, true)        AS allow_discounts,
      COALESCE(w.max_discount_percent, 100)    AS max_discount_percent,
      COALESCE(w.block_booking_if_owes, false) AS block_booking_if_owes,
      COALESCE(w.allow_overpay, true)          AS allow_overpay,
      w.updated_at
    FROM branches b
    LEFT JOIN branch_workflow w ON w.tenant_id = b.tenant_id AND w.branch_id = b.id
    WHERE b.id = $2 AND b.tenant_id = $1`
    const { rows } = await client.query(query, [tenant_id, branch_id])
    return rows[0] || null
}

async function saveWorkflow({ allow_settle_unpaid, allow_discounts, max_discount_percent, block_booking_if_owes, allow_overpay }, updated_by, tenant_id, branch_id) {
    const query = `
    INSERT INTO branch_workflow
      (tenant_id, branch_id, allow_settle_unpaid, allow_discounts, max_discount_percent, block_booking_if_owes, allow_overpay, updated_by, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (tenant_id, branch_id) DO UPDATE SET
      allow_settle_unpaid   = EXCLUDED.allow_settle_unpaid,
      allow_discounts       = EXCLUDED.allow_discounts,
      max_discount_percent  = EXCLUDED.max_discount_percent,
      block_booking_if_owes = EXCLUDED.block_booking_if_owes,
      allow_overpay         = EXCLUDED.allow_overpay,
      updated_by            = EXCLUDED.updated_by,
      updated_at            = NOW()
    RETURNING allow_settle_unpaid, allow_discounts, max_discount_percent, block_booking_if_owes, allow_overpay, updated_at`
    const values = [tenant_id, branch_id, allow_settle_unpaid, allow_discounts, max_discount_percent, block_booking_if_owes, allow_overpay, updated_by]
    const { rows } = await pool.query(query, values)
    return rows[0]
}

export default {
    getEffectiveSettings,
    getWorkflow,
    saveWorkflow
}
