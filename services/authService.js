import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import appError from '../utils/appError.js';

import authModel from '../models/authModel.js';
import tenantModel from '../models/tenantModel.js';
import branchModel from '../models/branchModel.js';
import userBranchRoleModel from '../models/userBranchRoleModel.js';
import permissionsModel from '../models/permissionsModel.js';
import refreshTokenModel from '../models/refreshTokenModel.js';

// ── Token settings ──────────────────────────────────────────────────────────
// Access token is short-lived (a leaked one dies in a day). Refresh token is the
// long-lived, REVOCABLE key that silently mints new access tokens.
const ACCESS_TOKEN_EXPIRES = '1d';
const REFRESH_TOKEN_DAYS = 30;
// Separate secret keeps a refresh token from ever being accepted as an access
// token; falls back to JWT_SECRET if not set (the type check still protects us).
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

function signAccessToken(identity) {
    return jwt.sign(identity, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
}

// Make a refresh token (a JWT carrying identity) and store ONLY its hash so we
// can revoke it later. Returns the raw token to hand to the client.
async function issueRefreshToken(identity) {
    const refreshToken = jwt.sign({ ...identity, type: 'refresh' }, REFRESH_SECRET, {
        expiresIn: `${REFRESH_TOKEN_DAYS}d`,
    });
    const expires_at = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    await refreshTokenModel.insert(identity.id, hashToken(refreshToken), expires_at);
    return refreshToken;
}

// Validate a refresh token and mint a NEW access token from it.
async function rotateAccessToken(refreshToken) {
    if (!refreshToken) throw appError('REFRESH_INVALID', 'No refresh token', 401);

    let payload;
    try {
        payload = jwt.verify(refreshToken, REFRESH_SECRET); // also checks expiry
    } catch {
        throw appError('REFRESH_INVALID', 'Invalid or expired refresh token', 401);
    }
    if (payload.type !== 'refresh') throw appError('REFRESH_INVALID', 'Not a refresh token', 401);

    const row = await refreshTokenModel.findByHash(hashToken(refreshToken));
    if (!row || row.revoked) throw appError('REFRESH_INVALID', 'Refresh token revoked', 401);

    const identity = {
        id: payload.id,
        tenant_id: payload.tenant_id,
        branch_id: payload.branch_id,
        role: payload.role,
        name: payload.name,
    };
    return signAccessToken(identity);
}

async function revokeRefreshToken(refreshToken) {
    if (!refreshToken) return;
    await refreshTokenModel.revokeByHash(hashToken(refreshToken));
}

const DUMMY_HASH =
    process.env.DUMMY_BCRYPT_HASH ||
    '$2b$10$1VnSDoUZPwK1d5DKFwRz9Oe2C1wq1k2F5qHk0G9mR3lQZ1x7E3J3S';

async function login({ email, password, branch_id }) {

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = await authModel.loginUser(normalizedEmail);
    const pwd = String(password || '');
    const hashToCompare = user ? user.password : DUMMY_HASH;
    const isMatch = await bcrypt.compare(pwd, hashToCompare);

    if (!user || !isMatch) throw appError('UNAUTHORIZED', 'Invalid credentials', 401);
    if (!user.is_active) throw appError('USER_NOT_ACTIVE', 'User is not active', 403);

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

    const tenant = await tenantModel.findTenantById(user.tenant_id);
    if (!tenant) throw appError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    if (tenant.status !== 'active') throw appError('TENANT_NOT_ACTIVE', 'Tenant is not active', 403);

    const user_id = user.id;
    const userRows = await userBranchRoleModel.findUserById(user_id, user.tenant_id);

    if (!userRows || userRows.length === 0) throw appError('ASSIGNMENT_NOT_ACTIVE', 'No active role assignment found', 403);

    let activeUserRow;

    if (userRows.length === 1) {
        activeUserRow = userRows[0];
    } else {
        if (branch_id) {
            activeUserRow = userRows.find(r => Number(r.branch_id) === Number(branch_id));
            if (!activeUserRow) throw appError('BRANCH_NOT_AUTHORIZED', 'Not authorized for this branch', 403);
        } else {
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

    if (!activeUserRow.is_active) throw appError('ASSIGNMENT_NOT_ACTIVE', 'Role assignment is inactive', 403);

    if (activeUserRow.branch_id !== null) {
        const branch = await branchModel.findBranchById(activeUserRow.branch_id);
        if (!branch) throw appError('BRANCH_NOT_FOUND', 'Branch not found', 404);
        if (branch.status !== 'active') throw appError('BRANCH_NOT_ACTIVE', 'Branch is not active', 403);
    }

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

async function switchBranch(user_id, tenant_id, branch_id) {

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

// Read the user's CURRENT role + permissions straight from the DB.
// Used on every request so permission/role changes apply instantly, instead of
// trusting a stale list baked into a long-lived token. A deactivated assignment
// returns no permissions, which effectively locks the user out immediately.
async function getLiveContext(user_id, tenant_id, branch_id) {
    // Platform admin (no tenant) keeps system-wide access, same as login.
    if (!tenant_id) {
        return { role: 'platform_admin', permissions: ['manage_system'], is_active: true };
    }

    const assignment = await userBranchRoleModel.findUserByAll(user_id, tenant_id, branch_id);
    if (!assignment || !assignment.is_active) {
        return { role: null, permissions: [], is_active: false };
    }

    const permissionsRow = await permissionsModel.findPermissionsByRole(assignment.role_id);
    const permissions = permissionsRow.map(row => row.permission_key);

    return { role: assignment.role_name, permissions, is_active: true };
}

export default { login, switchBranch, getLiveContext, signAccessToken, issueRefreshToken, rotateAccessToken, revokeRefreshToken }