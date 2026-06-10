import userService from '../services/userService.js'
import asyncWrap from '../utils/asyncWrap.js'

const create = asyncWrap(async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const result = await userService.create(req.body, tenant_id);
    res.status(201).json({ ok: true, data: result });
})

const getAll = asyncWrap(async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const result = await userService.getAll(tenant_id);
    res.status(200).json({ ok: true, data: result });
})

const getById = asyncWrap(async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const user_id = req.params.userId;
    const result = await userService.getById(user_id, tenant_id);
    res.status(200).json({ ok: true, data: result });
})

const update = asyncWrap(async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const user_id = req.params.userId;
    const result = await userService.update(user_id, tenant_id, req.body);
    res.status(200).json({ ok: true, data: result });
})

const assignToBranch = asyncWrap(async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const user_id = req.params.userId;
    const result = await userService.assignToBranch(user_id, tenant_id, req.body);
    res.status(200).json({ ok: true, data: result });
})

const getRoles = asyncWrap(async (req, res) => {
    const result = await userService.getRoles();
    res.status(200).json({ ok: true, data: result });
})

const deactivate = asyncWrap(async (req, res) => {
    const tenant_id = req.user.tenant_id;
    const user_id = req.params.userId;
    await userService.update(user_id, tenant_id, { is_active: false });
    res.status(200).json({ ok: true });
})

export default { create, getAll, getById, update, getRoles, assignToBranch, deactivate }