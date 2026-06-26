import planService from '../services/planService.js';
import asyncWrap from '../utils/asyncWrap.js';

const create = asyncWrap(async (req, res) => {
    const result = await planService.create(req.body);
    res.status(201).json({ ok: true, data: result });
})

const getAll = asyncWrap(async (req, res) => {
    const result = await planService.getAll();
    res.status(200).json({ ok: true, data: result });
})

// Public: plans + their features (no auth).
const getPublic = asyncWrap(async (req, res) => {
    const result = await planService.getPublic();
    res.status(200).json({ ok: true, data: result });
})

const getById = asyncWrap(async (req, res) => {
    const result = await planService.getById(Number(req.params.planId));
    res.status(200).json({ ok: true, data: result });
})

const update = asyncWrap(async (req, res) => {
    const result = await planService.update(Number(req.params.planId), req.body);
    res.status(200).json({ ok: true, data: result });
})

const _delete = asyncWrap(async (req, res) => {
    await planService.delete(Number(req.params.planId));
    res.status(200).json({ ok: true });
})

export default { create, getAll, getPublic, getById, update, delete: _delete };