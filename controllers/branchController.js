import branchService from "../services/branchService.js";
import branchDashboardService from "../services/branchDashboardService.js";
import asyncWrap from "../utils/asyncWrap.js";

const getById = asyncWrap(async (req, res) => {
    const targetBranchId = req.params.branchId;
    const { tenant_id, branch_id, permissions } = req.user;

    const result = await branchService.getById(targetBranchId, tenant_id, { branch_id, permissions });
    res.status(200).json({ ok: true, data: result });
});

const update = asyncWrap(async (req, res) => {
    const targetBranchId = req.params.branchId;
    const { tenant_id, branch_id, permissions } = req.user;

    const result = await branchService.update(req.body, targetBranchId, tenant_id, { branch_id, permissions });
    res.status(200).json({ ok: true, data: result });
});

// the overview of the branch the user is working in now
const getDashboard = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await branchDashboardService.getDashboard(tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
});

export default { getById, update, getDashboard }