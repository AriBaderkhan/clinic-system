import asyncWrap from "../utils/asyncWrap.js";
import floorService from "../services/floorService.js";

const getAll = asyncWrap(async (req, res) => {
    const { id, tenant_id, branch_id } = req.user;
    const result = await floorService.getAll(id, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const create = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await floorService.create(req.body, tenant_id, branch_id);
    res.status(201).json({ ok: true, data: result });
})

const update = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await floorService.update(req.params.floorId, req.body, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const _delete = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    await floorService.delete(req.params.floorId, tenant_id, branch_id);
    res.status(200).json({ ok: true });
})

const getStaff = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await floorService.getStaff(tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

const setStaffFloor = asyncWrap(async (req, res) => {
    const { tenant_id, branch_id } = req.user;
    const result = await floorService.setStaffFloor(req.params.userId, req.body.floor_id, tenant_id, branch_id);
    res.status(200).json({ ok: true, data: result });
})

export default { getAll, create, update, delete: _delete, getStaff, setStaffFloor }
