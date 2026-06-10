import subscriptionService from "../services/subscriptionService.js";
import asyncWrap from '../utils/asyncWrap.js';

const create = asyncWrap(async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const { planId } = req.body;
    const result = await subscriptionService.create(tenantId, planId);
    res.status(201).json({ ok: true, data: result });
})

const getAll = asyncWrap(async (req, res) => {
    const result = await subscriptionService.getAll();
    res.status(200).json({ ok: true, data: result });
})

const getById = asyncWrap(async (req, res) => {
    const result = await subscriptionService.getById(Number(req.params.subscriptionId));
    res.status(200).json({ ok: true, data: result });
})

const update = asyncWrap(async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const subscriptionId = Number(req.params.subscriptionId);
    const result = await subscriptionService.update(subscriptionId, tenantId, req.body);
    res.status(200).json({ ok: true, data: result });
})

export default { create, getAll, getById, update }