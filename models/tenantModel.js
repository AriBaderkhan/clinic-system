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

// the clinic's name / logo (runs inside the service's transaction)
async function updateTenant(fields, tenantId, client = pool) {
    await client.query(`
    UPDATE tenants
    SET
      name = COALESCE($1,name),
      logo_url = COALESCE($2,logo_url)
    WHERE id = $3
    `, [fields.name, fields.logo_url, tenantId]);
}

// the clinic's time zone / currency (runs inside the service's transaction)
async function updateTenantSettings(fields, tenantId, client = pool) {
    const result = await client.query(`
    UPDATE tenant_settings
    SET
      timezone = COALESCE($1,timezone),
      currency_code = COALESCE($2,currency_code)
    WHERE tenant_id = $3
    RETURNING *
    `, [fields.timezone, fields.currency_code, tenantId]);
    return result.rows[0];
}

// the clinic's branch limit; locks its subscription row so two "add branch" requests run one after the other
async function lockPlanLimit(tenantId, client = pool) {
    const query = `
    SELECT p.max_branches
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.tenant_id = $1
    FOR UPDATE OF s`;
    const result = await client.query(query, [tenantId]);
    return result.rows[0] || null;
}

async function countBranches(tenantId, client = pool) {
    const result = await client.query('SELECT COUNT(*)::int AS n FROM branches WHERE tenant_id = $1', [tenantId]);
    return result.rows[0].n;
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

// locks the branch row: nobody can add a patient / expense to it until the delete is finished
async function lockBranch(branchId, tenantId, client = pool) {
    const query = `SELECT id FROM branches WHERE id = $1 AND tenant_id = $2 FOR UPDATE`;
    const result = await client.query(query, [branchId, tenantId]);
    return result.rows[0] || null;
}

// true when the branch holds any clinic data (deleting it would remove that data with it)
async function branchHasData(branchId, client = pool) {
    const query = `
    SELECT EXISTS (SELECT 1 FROM patients WHERE branch_id = $1)
        OR EXISTS (SELECT 1 FROM appointments WHERE branch_id = $1)
        OR EXISTS (SELECT 1 FROM monthly_expenses WHERE branch_id = $1)
        OR EXISTS (SELECT 1 FROM labs WHERE branch_id = $1)
        OR EXISTS (SELECT 1 FROM discounts WHERE branch_id = $1)
        OR EXISTS (SELECT 1 FROM feedbacks WHERE branch_id = $1) AS has_data`;
    const result = await client.query(query, [branchId]);
    return result.rows[0].has_data;
}

async function deleteBranch(branchId, tenantId, client = pool) {
    const query = `
    DELETE FROM branches
    WHERE id = $1 AND tenant_id = $2
    RETURNING *;
    `;
    const values = [branchId, tenantId];
    const result = await client.query(query, values);
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

async function branchBelongsToTenant(branchId, tenantId) {

    const query = `
    SELECT EXISTS( SELECT 1 FROM branches WHERE id = $1 AND tenant_id = $2)`

    const values = [branchId, tenantId];
    const result = await pool.query(query, values);
    return result.rows[0].exists;
}

async function getDashboardStats(tenant_id) {
  const query = `
    SELECT
      (SELECT COUNT(*) FROM branches      WHERE tenant_id = $1 AND status = 'active')   AS active_branches,
      (SELECT COUNT(*) FROM users         WHERE tenant_id = $1 AND is_active = true)     AS total_users
  `;
  const { rows } = await pool.query(query, [tenant_id]);
  return rows[0];
}

export default { 
    findTenantById, getTenantDetails, updateTenant, updateTenantSettings, lockPlanLimit, countBranches, getAllBranches, 
    createBranch, createBranchSettings, lockBranch, branchHasData, deleteBranch, 
    updateBranch, branchBelongsToTenant,  getDashboardStats}