import asyncWrap from "../utils/asyncWrap.js";
import specialtyService from "../services/specialtyService.js";

const getAll = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await specialtyService.getAll(tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const create = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await specialtyService.create(req.body, tenant_id, branch_id);
    res.status(201).json({ ok: true, data: result });
})

const update = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await specialtyService.update(req.params.specialtyId, req.body, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const _delete = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    await specialtyService.delete(req.params.specialtyId, tenant_id, branch_id);
    res.status(200).json({ ok: true });
})

export default { getAll, create, update, delete: _delete }
