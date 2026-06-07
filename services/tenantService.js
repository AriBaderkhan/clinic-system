import tenantModel from '../models/tenantModel.js';
import pool from '../db_connection.js';
import branchModel from '../models/branchModel.js';
import appError from '../utils/appError.js';

async function getTenantDetails(tenantId) {
    // Pass undefined as first arg to use the default 'pool' defined in the model
    const tenant = await tenantModel.getTenantDetails(undefined, tenantId);
    return tenant;
}

async function updateTenant(fields, tenantId) {
    const tenant = await tenantModel.updateTenant(fields, tenantId);
    return tenant;
}

async function getAllBranches(tenantId) {
    const branches = await tenantModel.getAllBranches(tenantId);
    return branches;
}

async function createBranch(tenantId, branchData) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { name, location, timezone, currency_code } = branchData;
        const branch = await tenantModel.createBranch(client, tenantId, name, location);
        const branchId = branch.id;

        const tenant = await tenantModel.getTenantDetails(undefined, tenantId);
        let timezoneUse = tenant.timezone;
        let currency_codeUse = tenant.currency_code;
        if (timezone) {
            timezoneUse = timezone;
        }
        if (currency_code) {
            currency_codeUse = currency_code;
        }
        await tenantModel.createBranchSettings(client, branchId, tenantId, timezoneUse, currency_codeUse);
        await client.query('COMMIT');
        return branch;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function updateBranch(branchData, targetBranchId, tenant_id) {
    const branch = await tenantModel.updateBranch(branchData, targetBranchId, tenant_id);
    return branch;
}

async function deleteBranch(branchId, tenantId) {
    const branch = await tenantModel.deleteBranch(branchId, tenantId);
    const branchSettings = await tenantModel.deleteBranchSettings(branchId, tenantId);
    return branch;
}



async function switchBranch(tenant_id, branchId) {

    const branch = await branchModel.findBranchById(branchId);
    if (!branch) throw appError('BRANCH_NOT_FOUND', 'Branch not found', 404);
    if (branch.status !== 'active') throw appError('BRANCH_NOT_ACTIVE', 'Branch is not active', 403);

    const isTrue = await tenantModel.branchBelongsToTenant(branchId, tenant_id);
    if (!isTrue) {
        throw appError('BRANCH_NOT_FOUND', 'Branch not found in tenant', 404);
}

return branch;

}

async function getDashboardStats(tenant_id) {
    const stats = await tenantModel.getDashboardStats(tenant_id);
    return stats;
}

export default {
    getTenantDetails,
    updateTenant,
    getAllBranches,
    createBranch,
    updateBranch,
    deleteBranch,
    switchBranch,
    getDashboardStats
}