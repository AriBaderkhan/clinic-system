import pool from '../db_connection.js';

// 1. Create Tenant
async function createTenant(client, name, logo_url) {
    const { rows } = await client.query(
        'INSERT INTO tenants (name, logo_url, status) VALUES ($1, $2, $3) RETURNING *',
        [name, logo_url, 'active']
    );
    return rows[0];
}

// 2. Create Settings
async function createTenantSettings(client, tenantId, timezone, currency) {
    const { rows } = await client.query(
        'INSERT INTO tenant_settings (tenant_id, timezone, currency_code) VALUES ($1, $2, $3) RETURNING *',
        [tenantId, timezone, currency]
    );
    return rows[0];
}


// 4. Create User (Transaction Safe)
async function createUser(client, email, password, tenantId) {
    const { rows } = await client.query(
        'INSERT INTO users (email, password, tenant_id, is_active) VALUES ($1, $2, $3, $4) RETURNING id',
        [email, password, tenantId, true]
    );
    return rows[0];
}

// 5. Create Profile (Transaction Safe)
async function createProfile(client, userId, fullName, phone, address) {
    const { rows } = await client.query(
        'INSERT INTO profiles (user_id, full_name, phone, address) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, fullName, phone, address]
    );
    return rows[0];
}

// 6. Assign Role (Transaction Safe)
async function assignRole(client, userId, roleId, tenantId, branchId) {
    const { rows } = await client.query(
        'INSERT INTO user_branch_roles (user_id, branch_id, tenant_id, role_id, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [userId, branchId, tenantId, roleId, true]
    );
    return rows[0];
}

// 7. Create Subscription (Transaction Safe)
async function createSubscription(client, tenantId, planId) {
    // First period = 37 days (30 of value + a 7-day buffer). After this the
    // tenant sees the renewal banner and pays to extend.
    const { rows } = await client.query(
        `INSERT INTO subscriptions (tenant_id, plan_id, status, start_date, end_date)
         VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '37 days') RETURNING *`,
        [tenantId, planId]
    );
    return rows[0];
}

// 8. Helper: Find Role
async function findRoleIdByName(roleName) {
    const { rows } = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
    return rows[0];
}

async function getAllTenants() {
    const { rows } = await pool.query(`
        SELECT t.*, 
        s.id as subscription_id,
        s.plan_id, 
        p.name as plan_name,
        p.max_branches,

        p.max_users
        FROM tenants t
        LEFT JOIN subscriptions s ON t.id = s.tenant_id
        LEFT JOIN plans p ON s.plan_id = p.id
        ORDER BY t.created_at DESC
    `);
    return rows;
}


export default {
    createTenant,
    createTenantSettings,
    createUser,
    createProfile,
    assignRole,
    createSubscription,
    findRoleIdByName,
    getAllTenants
};
