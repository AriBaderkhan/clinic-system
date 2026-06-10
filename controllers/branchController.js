import branchService from "../services/branchService.js";
import asyncWrap from "../utils/asyncWrap.js";

const getById = asyncWrap(async (req, res) => {
    const targetBranchId = req.params.branchId;
    const { tenant_id, branch_id, role } = req.user;

    if ((role !== 'tenant_manager' && role !== 'branch_manager') && targetBranchId !== Number(branch_id)) {
        return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'Forbidden' });
    }
    const result = await branchService.getById(targetBranchId, tenant_id);
    res.status(200).json({ ok: true, data: result });
});

const update = asyncWrap(async (req, res) => {
    const targetBranchId = req.params.branchId;
    const { tenant_id, branch_id, role } = req.user;

    if ((role !== 'tenant_manager' && role !== 'branch_manager') && targetBranchId !== Number(branch_id)) {
        return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'Forbidden' });
    }
    const result = await branchService.update(req.body, targetBranchId, tenant_id);
    res.status(200).json({ ok: true, data: result });
});

export default { getById, update }