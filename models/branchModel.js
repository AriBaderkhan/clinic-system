import pool from '../db_connection.js';

async function findBranchById(branch_id) {
    const query = 'SELECT * FROM branches WHERE id = $1';
    const values = [branch_id];
    const result = await pool.query(query, values);
    return result.rows[0];
} // used in appt


async function getBranchDetails(targetBranchId, tenantId) {
    const query = `
    SELECT 
    b.id,
    b.name,
    b.location,
    COALESCE(bs.timezone,ts.timezone) AS timezone,
    COALESCE(bs.currency_code,ts.currency_code) AS currency_code
    FROM branches b 
    LEFT JOIN tenant_settings ts ON b.tenant_id = ts.tenant_id
    LEFT JOIN branch_settings bs ON b.id = bs.branch_id AND b.tenant_id = bs.tenant_id
    WHERE b.id = $1 AND b.tenant_id = $2
    LIMIT 1
    `;
    const values = [targetBranchId, tenantId];
    const result = await pool.query(query, values);
    return result.rows[0];
}

async function updateBranch(branchData, targetBranchId, tenantId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const query = `
    UPDATE branches
    SET name = COALESCE($1, name),
    location = COALESCE($2, location)
    WHERE id = $3 AND tenant_id = $4
    RETURNING *
    `;
        const values = [branchData.name, branchData.location, targetBranchId, tenantId];
        const result = await client.query(query, values);

        // Check if settings exist
        const checkQuery = `SELECT 1 FROM branch_settings WHERE branch_id = $1 AND tenant_id = $2`;
        const checkRes = await client.query(checkQuery, [targetBranchId, tenantId]);

        let result2;
        if (checkRes.rowCount === 0) {
            // Insert if missing
            const insertQuery = `
            INSERT INTO branch_settings (branch_id, tenant_id, timezone, currency_code)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `;
            const insertValues = [targetBranchId, tenantId, branchData.timezone || 'Asia/Baghdad', branchData.currency_code || 'IQD'];
            result2 = await client.query(insertQuery, insertValues);
        } else {
            // Update if exists
            const query2 = `
            UPDATE branch_settings
            SET timezone = COALESCE($1, timezone),
            currency_code = COALESCE($2, currency_code)
            WHERE branch_id = $3 AND tenant_id = $4
            RETURNING *
            `;
            const values2 = [branchData.timezone, branchData.currency_code, targetBranchId, tenantId];
            result2 = await client.query(query2, values2);
        }

        await client.query('COMMIT');
        return result2.rows[0]
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
export default { findBranchById, getBranchDetails, updateBranch }