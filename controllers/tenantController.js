import tenantService from "../services/tenantService.js";
import asyncWrap from "../utils/asyncWrap.js";
import jwt from 'jsonwebtoken';

const getDetails = asyncWrap(async (req, res) => {
    const tenantId = req.user.tenant_id;
    const result = await tenantService.getDetails(tenantId);
    res.status(200).json({ ok: true, data: result });
});

const update = asyncWrap(async (req, res) => {
    const tenantId = req.user.tenant_id;
    const result = await tenantService.update(req.body, tenantId);
    res.status(200).json({ ok: true, data: result });
});

const getBranches = asyncWrap(async (req, res) => {
    const result = await tenantService.getBranches(req.user.tenant_id);
    res.status(200).json({ ok: true, data: result });
});

const createBranch = asyncWrap(async (req, res) => {
    const { tenant_id } = req.user;
    const result = await tenantService.createBranch(tenant_id, req.body);
    res.status(201).json({ ok: true, data: result });
});

const updateBranch = asyncWrap(async (req, res) => {
    const targetBranchId = req.params.id;
    const { tenant_id } = req.user;
    const result = await tenantService.updateBranch(req.body, targetBranchId, tenant_id);
    res.status(200).json({ ok: true, data: result });
});

const deleteBranch = asyncWrap(async (req, res) => {
    const { tenant_id } = req.user;
    await tenantService.deleteBranch(req.params.id, tenant_id);
    res.status(200).json({ ok: true });
});

const switchBranch = asyncWrap(async (req, res) => {
    const { tenant_id } = req.user;
    const branchId = req.params.branchId;
    const branch = await tenantService.switchBranch(tenant_id, branchId);
    const payload = {
        id: req.user.id,
        tenant_id: tenant_id,
        branch_id: branchId,
        role: req.user.role,
        name: req.user.name,
        permissions: req.user.permissions
    }
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '10h' })
    res.status(200).json({ ok: true, token, data: branch });
})

const getDashboard = asyncWrap(async (req, res) => {
    const { tenant_id } = req.user;
    const result = await tenantService.getDashboard(tenant_id);
    res.status(200).json({ ok: true, data: result });
});

export default {
    getDetails, update, getBranches, createBranch,
    updateBranch, deleteBranch, switchBranch, getDashboard
}