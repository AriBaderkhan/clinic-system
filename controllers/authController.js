import authService from '../services/authService.js';
import jwt from 'jsonwebtoken';
import asyncWrap from '../utils/asyncWrap.js';


const controllerLogin = asyncWrap(async (req, res) => {

    const result = await authService.serviceLogin(req.body);

    if (result.requiresBranchSelection) {
        return res.status(200).json({
            message: 'Select a branch',
            requiresBranchSelection: true,
            branches: result.branches
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
        message: 'Logged in Successfully',
        token,
        user: {
            id: user.id,
            tenant_id: user.tenant_id,
            branch_id: user.branch_id,
            role: user.role,
            name: user.name,
            permissions: user.permissions
        }
    })
})


const controllerSwitchBranch = asyncWrap(async (req, res) => {
    const { branch_id } = req.body;
    const { id, tenant_id } = req.user;

    const user = await authService.serviceSwitchBranch(id, tenant_id, branch_id);
    const payload = {
        id: user.id,
        tenant_id: user.tenant_id,
        branch_id: user.branch_id,
        role: user.role,
        name: user.name,
        permissions: user.permissions
    };
    const token1 = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN })
    res.status(200).json({
        message: 'Switched Successfully ',
        token1,
        user: {
            id: user.id,
            tenant_id: user.tenant_id,
            branch_id: user.branch_id,
            role: user.role,
            name: user.name,
            permissions: user.permissions
        }
    })
})
export default { controllerLogin, controllerSwitchBranch }