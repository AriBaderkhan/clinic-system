import bcrypt from 'bcrypt';
import appError from '../utils/appError.js';

import authModel from '../models/authModel.js';
import tenantModel from '../models/tenantModel.js';
import branchModel from '../models/branchModel.js';
import userBranchRoleModel from '../models/userBranchRoleModel.js';
import permissionsModel from '../models/permissionsModel.js';

const DUMMY_HASH =
    process.env.DUMMY_BCRYPT_HASH ||
    '$2b$10$1VnSDoUZPwK1d5DKFwRz9Oe2C1wq1k2F5qHk0G9mR3lQZ1x7E3J3S';




async function serviceLogin({ email, password, branch_id }) {

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = await authModel.loginUser(normalizedEmail);
    const pwd = String(password || '');
    const hashToCompare = user ? user.password : DUMMY_HASH;
    const isMatch = await bcrypt.compare(pwd, hashToCompare);

    // 1. Authentication Checks
    if (!user || !isMatch) throw appError('UNAUTHORIZED', 'Invalid credentials', 401);
    if (!user.is_active) throw appError('USER_NOT_ACTIVE', 'User is not active', 403);

    // chewck if it's system_manager or not 
    if (!user.tenant_id || user.tenant_id === null) {
        return {
            id: user.id,
            name: user.full_name,
            role: 'platform_admin',
            permissions: ['manage_system'],
            tenant_id: null,
            branch_id: null,
        };
    }
    // 2. Tenant Checks
    const tenant = await tenantModel.findTenantById(user.tenant_id);
    if (!tenant) throw appError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    if (tenant.status !== 'active') throw appError('TENANT_NOT_ACTIVE', 'Tenant is not active', 403);

    // 3. User Branch Roles
    const user_id = user.id;
    const userRows = await userBranchRoleModel.findUserById(user_id, user.tenant_id);

    if (!userRows || userRows.length === 0) throw appError('ASSIGNMENT_NOT_ACTIVE', 'No active role assignment found', 403);

    let activeUserRow;

    // 4. Handle Branch Selection
    if (userRows.length === 1) {
        // Case A: Single Branch -> Auto-select
        activeUserRow = userRows[0];
    } else {
        // Case B: Multiple Branches
        if (branch_id) {
            // If branch_id provided, find matching row
            activeUserRow = userRows.find(r => Number(r.branch_id) === Number(branch_id));
            if (!activeUserRow) throw appError('BRANCH_NOT_AUTHORIZED', 'Not authorized for this branch', 403);
        } else {
            // If no branch_id, return list for selection (Controller handles response)
            const branches = userRows.map(r => ({
                branch_id: r.branch_id,
                branch_name: r.branch_name,
                role_name: r.role_name
            }));

            return {
                requiresBranchSelection: true,
                branches: branches,
                user: { id: user.id, email: user.email }
            };
        }
    }

    // 5. Verify Selected Branch/Role
    if (!activeUserRow.is_active) throw appError('ASSIGNMENT_NOT_ACTIVE', 'Role assignment is inactive', 403);

    // check if it's tenant_admin or not 
    if (activeUserRow.branch_id !== null) {
        const branch = await branchModel.findBranchById(activeUserRow.branch_id);
        if (!branch) throw appError('BRANCH_NOT_FOUND', 'Branch not found', 404);
        if (branch.status !== 'active') throw appError('BRANCH_NOT_ACTIVE', 'Branch is not active', 403);
    }

    // 6. Get Permissions
    const permissionsRow = await permissionsModel.findPermissionsByRole(activeUserRow.role_id);
    const permissions = permissionsRow.map(row => row.permission_key);

    return {
        id: user.id,
        tenant_id: user.tenant_id,
        branch_id: activeUserRow.branch_id || null,
        role: activeUserRow.role_name,
        name: user.full_name,
        permissions: permissions
    }
}


async function serviceSwitchBranch(user_id, tenant_id, branch_id) {

    const user = await authModel.selectAUser(user_id, tenant_id);
    if (!user) throw appError('USER_NOT_FOUND', 'User not found', 404);
    if (!user.is_active) throw appError('USER_NOT_ACTIVE', 'User is not active', 403);

    const branch = await branchModel.findBranchById(branch_id);
    if (!branch) throw appError('BRANCH_NOT_FOUND', 'Branch not found', 404);
    if (branch.status !== 'active') throw appError('BRANCH_NOT_ACTIVE', 'Branch is not active', 403);

    const userRow = await userBranchRoleModel.findUserByAll(user_id, tenant_id, branch_id);
    if (!userRow) throw appError('USER_NOT_FOUND', 'User not found', 404);
    if (!userRow.is_active) throw appError('USER_ASSIGNMENT_NOT_ACTIVE', 'user Assignment is not active', 403);

    const permissionsRow = await permissionsModel.findPermissionsByRole(userRow.role_id);
    const permissions = permissionsRow.map(row => row.permission_key);

    return {
        id: user.id,
        tenant_id: user.tenant_id,
        branch_id: branch_id,
        role: userRow.role_name,
        name: user.full_name,
        permissions: permissions
    }
}

export default { serviceLogin, serviceSwitchBranch }