import asyncWrap from "../utils/asyncWrap.js";
import worksService from "../services/worksService.js";

const create = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await worksService.create(req.body, tenant_id, branch_id);
    res.status(201).json({ ok: true, data: result });
})

const getAll = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await worksService.getAll(tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const getById = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const { workId } = req.params;
    const result = await worksService.getById(workId, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const update = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const { workId } = req.params;
    const result = await worksService.update(workId, req.body, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const _delete = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const { workId } = req.params;
    await worksService.delete(workId, tenant_id, branch_id);
    res.status(200).json({ ok: true });
})

export default { create, getAll, getById, update, delete: _delete }