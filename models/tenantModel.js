import pool from '../db_connection.js';


async function findTenantById(tenant_id) {
    const query = 'SELECT * FROM tenants WHERE id = $1';
    const values = [tenant_id];
    const result = await pool.query(query, values);
    return result.rows[0];
}

async function getTenantDetails(client = pool, tenantId) {
    const query = `
    SELECT 
    t.id,
    t.name,
    t.logo_url,
    COALESCE(ts.timezone,'Asia/Baghdad') as timezone,
    COALESCE(ts.currency_code,'IQD') as currency_code
    FROM tenants t
    LEFT JOIN tenant_settings ts ON t.id = ts.tenant_id
    WHERE t.id = $1
    `
    const values = [tenantId];
    const result = await client.query(query, values);
    return result.rows[0];
}

async function updateTenant(fields, tenantId) {
    await pool.query('BEGIN');

    await pool.query(`
    UPDATE tenants
    SET
      name = COALESCE($1,name),
      logo_url = COALESCE($2,logo_url)
    WHERE id = $3
    `, [fields.name, fields.logo_url, tenantId]);

    const result = await pool.query(`
    UPDATE tenant_settings
    SET
      timezone = COALESCE($1,timezone),
      currency_code = COALESCE($2,currency_code)
    WHERE tenant_id = $3
    RETURNING *
    `, [fields.timezone, fields.currency_code, tenantId]);

    await pool.query('COMMIT');

    return result.rows[0];
}

async function getAllBranches(tenantId) {
    const query = `SELECT
    b.id,
        b.name,
        b.location,
        b.status,
        COALESCE(bs.timezone, ts.timezone) as timezone,
        COALESCE(bs.currency_code, ts.currency_code) as currency_code
    FROM branches b
    JOIN tenant_settings ts ON b.tenant_id = ts.tenant_id
    LEFT JOIN branch_settings bs ON b.id = bs.branch_id AND bs.tenant_id = b.tenant_id
    WHERE b.tenant_id = $1
        `
    const values = [tenantId];
    const result = await pool.query(query, values);
    return result.rows;
}


async function createBranch(client = pool, tenantId, name, location) {

    const branch = await client.query(`
    INSERT INTO branches(tenant_id, name, location)
    VALUES($1, $2, $3)
    RETURNING *
        `, [tenantId, name, location]);
    return branch.rows[0];
}

async function createBranchSettings(client = pool, branchId, tenantId, timezone, currency_code) {
    const query = `
    INSERT INTO branch_settings(branch_id, tenant_id, timezone, currency_code)
    VALUES($1, $2, $3, $4)
    RETURNING *
        `
    const values = [branchId, tenantId, timezone, currency_code];
    const result = await client.query(query, values);
    return result.rows[0];
}

async function deleteBranch(branchId, tenantId) {
    const query = `
    DELETE FROM branches
    WHERE id = $1 AND tenant_id = $2
    RETURNING *;
    `;
    const values = [branchId, tenantId];
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
    location = COALESCE($2, location),
    status = COALESCE($3, status)
    WHERE id = $4 AND tenant_id = $5
    RETURNING *
    `;
        const values = [branchData.name, branchData.location, branchData.status, targetBranchId, tenantId];
        const result = await client.query(query, values);

        const query2 = `
        UPDATE branch_settings
        SET timezone = COALESCE($1, timezone),
        currency_code = COALESCE($2, currency_code)
        WHERE branch_id = $3 AND tenant_id = $4
        RETURNING *
        `;
        const values2 = [branchData.timezone, branchData.currency_code, targetBranchId, tenantId];
        const result2 = await client.query(query2, values2);
        if (result2.rowCount === 0) {
            const query3 = `
            INSERT INTO branch_settings (branch_id, tenant_id, timezone, currency_code)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `;
            const values3 = [targetBranchId, tenantId, branchData.timezone || 'Asia/Baghdad', branchData.currency_code || 'IQD'];
            await client.query(query3, values3);
        }

        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function deleteBranchSettings(branchId, tenantId) {
    const query = `
    DELETE FROM branch_settings
    WHERE branch_id = $1 AND tenant_id = $2
    RETURNING *;
    `;
    const values = [branchId, tenantId];
    const result = await pool.query(query, values);
    return result.rows[0];
}

async function branchBelongsToTenant(branchId, tenantId) {

    const query = `
    SELECT EXISTS( SELECT 1 FROM branches WHERE id = $1 AND tenant_id = $2)`

    const values = [branchId, tenantId];
    const result = await pool.query(query, values);
    return result.rows[0].exists;
}
export default { findTenantById, getTenantDetails, updateTenant, getAllBranches, createBranch, createBranchSettings, deleteBranch, deleteBranchSettings, updateBranch, branchBelongsToTenant }