import branchService from "../services/branchService.js";
import asyncWrap from "../utils/asyncWrap.js";

const getBranchDetails = asyncWrap(async (req, res) => {
    const targetBranchId = req.params.branchId;
    const { tenant_id, branch_id, role } = req.user;

    if ((role !== 'tenant_manager' && role !== 'branch_manager') && targetBranchId !== Number(branch_id)) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    const branch = await branchService.getBranchDetails(targetBranchId, tenant_id);
    res.status(200).json({ message: 'Branch Details', data: branch });
});

const updateBranch = asyncWrap(async (req, res) => {
    const targetBranchId = req.params.branchId;
    const { tenant_id, branch_id, role } = req.user;

    if ((role !== 'tenant_manager' && role !== 'branch_manager') && targetBranchId !== Number(branch_id)) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    const branch = await branchService.updateBranch(req.body, targetBranchId, tenant_id);
    res.status(200).json({ message: 'Branch Updated', data: branch });
});

export default {
    getBranchDetails,
    updateBranch
}