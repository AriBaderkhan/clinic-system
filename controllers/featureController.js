import featureService from "../services/featureService.js";
import asyncWrap from '../utils/asyncWrap.js';

const create = asyncWrap(async (req, res) => {
    const result = await featureService.create(req.body);
    res.status(201).json({ ok: true, data: result });
});

const getAll = asyncWrap(async (req, res) => {
    const result = await featureService.getAll();
    res.status(200).json({ ok: true, data: result });
});

const assign = asyncWrap(async (req, res) => {
    const planId = Number(req.params.planId);
    const { feature_id } = req.body;
    const result = await featureService.assign(planId, feature_id);
    res.status(201).json({ ok: true, data: result });
});

const remove = asyncWrap(async (req, res) => {
    const planId = Number(req.params.planId);
    const featureId = Number(req.params.featureId);
    await featureService.remove(planId, featureId);
    res.status(200).json({ ok: true });
});

const getPlanFeatures = asyncWrap(async (req, res) => {
    const planId = Number(req.params.planId);
    const result = await featureService.getPlanFeatures(planId);
    res.status(200).json({ ok: true, data: result });
});

const getTenantGrants = asyncWrap(async (req, res) => {
    const result = await featureService.getTenantGrants(Number(req.params.tenantId));
    res.status(200).json({ ok: true, data: result });
});

const grant = asyncWrap(async (req, res) => {
    const result = await featureService.grant(Number(req.params.tenantId), req.body, req.user.id);
    res.status(201).json({ ok: true, data: result });
});

const revoke = asyncWrap(async (req, res) => {
    await featureService.revoke(Number(req.params.tenantId), Number(req.params.featureId));
    res.status(200).json({ ok: true });
});

export default { create, getAll, assign, remove, getPlanFeatures, getTenantGrants, grant, revoke };