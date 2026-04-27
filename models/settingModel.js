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

export default {
    getEffectiveSettings
}