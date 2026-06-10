import pool from '../db_connection.js';
import adminPlatformModel from '../models/adminPlatformModel.js';
import appError from '../utils/appError.js';
import bcrypt from 'bcrypt';

async function register(body) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const tenant = await adminPlatformModel.createTenant(client, body.tenant_name, null);
        if (!tenant) throw appError('TENANT_FAILED', 'Failed to create tenant', 500);

        await adminPlatformModel.createTenantSettings(client, tenant.id, body.timezone || 'UTC', body.currency || 'USD');

        const hashedPassword = await bcrypt.hash(body.manager_password, 10);
        const user = await adminPlatformModel.createUser(client, body.manager_email, hashedPassword, tenant.id);
        const userId = user.id;

        await adminPlatformModel.createProfile(client, userId, body.manager_name, body.phone || '', body.address || '');

        const role = await adminPlatformModel.findRoleIdByName('tenant_manager');
        if (!role) throw appError('ROLE_MISSING', 'Manager role not found', 500);

        await adminPlatformModel.assignRole(client, userId, role.id, tenant.id, null);

        await adminPlatformModel.createSubscription(client, tenant.id, body.plan_id);

        await client.query('COMMIT');
        return { tenant_id: tenant.id, message: "Tenant registered successfully" };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function getAll() {
    return await adminPlatformModel.getAllTenants();
}

export default { register, getAll };