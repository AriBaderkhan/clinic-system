import branchModel from "../models/branchModel.js";

async function getBranchDetails(targetBranchId, tenant_id) {
    const branch = await branchModel.getBranchDetails(targetBranchId, tenant_id);
    return branch;
}

async function updateBranch(branchData, targetBranchId, tenant_id) {
    const branch = await branchModel.updateBranch(branchData, targetBranchId, tenant_id);
    return branch;
}

export default {
    getBranchDetails,
    updateBranch
}
