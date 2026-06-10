import authService from '../services/authService.js';
import jwt from 'jsonwebtoken';
import asyncWrap from '../utils/asyncWrap.js';

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
    const payload = {
        id: user.id,
        tenant_id: user.tenant_id,
        branch_id: user.branch_id || null,
        role: user.role,
        name: user.name,
        permissions: user.permissions
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
    res.status(200).json({
        ok: true,
        token,
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
    const payload = {
        id: user.id,
        tenant_id: user.tenant_id,
        branch_id: user.branch_id,
        role: user.role,
        name: user.name,
        permissions: user.permissions
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
    res.status(200).json({
        ok: true,
        token,
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

export default { login, switchBranch }