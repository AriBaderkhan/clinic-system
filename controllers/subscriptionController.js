import subscriptionService from "../services/subscriptionService.js";
import asyncWrap from '../utils/asyncWrap.js';

const createSubscription = asyncWrap(async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const { planId } = req.body;
    const subscription = await subscriptionService.createSubscription(tenantId, planId);
    res.status(201).json(subscription);
})

const getAllSubscriptions = asyncWrap(async (req, res) => {
    const subscription = await subscriptionService.getAllSubscriptions();
    res.status(200).json(subscription);
})

const getSubscription = asyncWrap(async (req, res) => {
    const subscription = await subscriptionService.getSubscription(Number(req.params.subscriptionId));
    res.status(200).json(subscription);
})

const updateSubscription = asyncWrap(async (req, res) => {
    const tenantId = Number(req.params.tenantId);
    const subscriptionId = Number(req.params.subscriptionId);
    const subscription = await subscriptionService.updateSubscription(subscriptionId, tenantId, req.body);
    res.status(200).json(subscription);
})
export default {
    createSubscription,
    getAllSubscriptions,
    getSubscription,
    updateSubscription
}