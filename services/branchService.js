import branchModel from "../models/branchModel.js";
import appError from "../utils/appError.js";

// your own branch, or any branch of the clinic when you have "manage branches"
const mustReach = (targetBranchId, caller) => {
    const own = Number(targetBranchId) === Number(caller.branch_id);
    if (!own && !caller.permissions.includes('manage_branches')) {
        throw appError('FORBIDDEN', 'You can only open your own branch', 403);
    }
}

async function getById(targetBranchId, tenant_id, caller) {
    mustReach(targetBranchId, caller);
    const branch = await branchModel.getBranchDetails(targetBranchId, tenant_id);
    return branch;
}

async function update(branchData, targetBranchId, tenant_id, caller) {
    mustReach(targetBranchId, caller);
    const branch = await branchModel.updateBranch(branchData, targetBranchId, tenant_id);
    return branch;
}

export default { getById, update }