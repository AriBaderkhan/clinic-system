import authService from '../services/authService.js';
import asyncWrap from '../utils/asyncWrap.js';

// Identity carried inside the tokens (no permissions — those are read live by
// authMiddleware on every request).
const identityOf = (user) => ({
    id: user.id,
    tenant_id: user.tenant_id,
    branch_id: user.branch_id || null,
    role: user.role,
    name: user.name,
});

const login = asyncWrap(async (req, res) => {
    const result = await authService.login(req.body);

    if (result.requiresBranchSelection) {
        return res.status(200).json({
            ok: true,
            requiresBranchSelection: true,
            data: result.branches
        });
    }

    const user = result;
    const identity = identityOf(user);
    const token = authService.signAccessToken(identity);             // short-lived
    const refreshToken = await authService.issueRefreshToken(identity); // long-lived, revocable

    res.status(200).json({
        ok: true,
        token,
        refreshToken,
        user: {
            id: user.id,
            tenant_id: user.tenant_id,
            branch_id: user.branch_id,
            role: user.role,
            name: user.name,
            permissions: user.permissions
        }
    });
})

const switchBranch = asyncWrap(async (req, res) => {
    const { branch_id } = req.body;
    const { id, tenant_id } = req.user;

    const user = await authService.switchBranch(id, tenant_id, branch_id);
    const identity = identityOf(user);
    const token = authService.signAccessToken(identity);
    const refreshToken = await authService.issueRefreshToken(identity);

    res.status(200).json({
        ok: true,
        token,
        refreshToken,
        user: {
            id: user.id,
            tenant_id: user.tenant_id,
            branch_id: user.branch_id,
            role: user.role,
            name: user.name,
            permissions: user.permissions
        }
    });
})

// Silent token renewal: client sends its refresh token, gets a fresh access token.
const refresh = asyncWrap(async (req, res) => {
    const { refreshToken } = req.body;
    const token = await authService.rotateAccessToken(refreshToken);
    res.status(200).json({ ok: true, token });
})

// Logout = revoke the refresh token (kills that session's renewal ability).
const logout = asyncWrap(async (req, res) => {
    const { refreshToken } = req.body;
    await authService.revokeRefreshToken(refreshToken);
    res.status(200).json({ ok: true });
})

// Returns the caller's CURRENT identity + live role/permissions.
// authMiddleware has already replaced req.user.permissions/role with fresh DB
// values, so the frontend can call this to keep its UI (button show/hide) in sync
// without forcing a re-login.
const me = asyncWrap(async (req, res) => {
    res.status(200).json({
        ok: true,
        user: {
            id: req.user.id,
            tenant_id: req.user.tenant_id,
            branch_id: req.user.branch_id,
            role: req.user.role,
            name: req.user.name,
            permissions: req.user.permissions,
        },
    });
});

// Public: send a reset code to the email (always 200 — never leak existence).
const forgotPassword = asyncWrap(async (req, res) => {
    const result = await authService.forgotPassword(req.body.email);
    res.status(200).json({ ok: true, data: result });
});

// Public: verify the code + set the new password.
const resetPassword = asyncWrap(async (req, res) => {
    const result = await authService.resetPassword(req.body.email, req.body.code, req.body.newPassword);
    res.status(200).json({ ok: true, data: result });
});

export default { login, switchBranch, me, refresh, logout, forgotPassword, resetPassword }