import tenantService from "../services/tenantService.js";
import asyncWrap from "../utils/asyncWrap.js";
import jwt from 'jsonwebtoken';

const getTenantDetails = asyncWrap(async (req, res) => {
    const tenantId = req.user.tenant_id;
    const tenant = await tenantService.getTenantDetails(tenantId);
    res.status(200).json({ message: 'Tenant Details', data: tenant });
});

const updateTenant = asyncWrap(async (req, res) => {
    const tenantId = req.user.tenant_id;
    const tenant = await tenantService.updateTenant(req.body, tenantId);
    res.status(200).json({ message: 'Tenant Updated', data: tenant });
});

const getAllBranches = asyncWrap(async (req, res) => {
    const branches = await tenantService.getAllBranches(req.user.tenant_id);
    res.status(200).json(branches);
});

const createBranch = asyncWrap(async (req, res) => {
    const { tenant_id } = req.user;
    const branch = await tenantService.createBranch(tenant_id, req.body);
    res.status(200).json(branch);
});

const updateBranch = asyncWrap(async (req, res) => {
    const targetBranchId = req.params.id;
    const { tenant_id, branch_id, role } = req.user;

    // Optional: validation if needed, but roleMiddleware covers role check.
    // For super_doctor (tenant admin), they can update any branch of their tenant.

    const branch = await tenantService.updateBranch(req.body, targetBranchId, tenant_id);
    res.status(200).json({ message: 'Branch Updated', data: branch });
});

const deleteBranch = asyncWrap(async (req, res) => {
    const { tenant_id } = req.user;
    const branch = await tenantService.deleteBranch(req.params.id, tenant_id);
    res.status(200).json(branch);
});

const switchBranch = asyncWrap(async (req,res) => {
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
        
    res.status(200).json({ message: 'Switched Branch', token, data: branch });
})
export default {
    getTenantDetails,
    updateTenant,
    getAllBranches,
    createBranch,
    updateBranch,
    deleteBranch,
    switchBranch
}