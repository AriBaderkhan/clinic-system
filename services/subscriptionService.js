import subscriptionModel from "../models/subscriptionModel.js";
import appError from '../utils/appError.js';

async function createSubscription(tenantId, planId) {
    const subscription = await subscriptionModel.createSubscription(tenantId, planId);
    if (!subscription) throw appError("SUBSCRIPTION_NOT_CREATED", 'subscription not created', 400)
    return subscription;
}

async function getAllSubscriptions() {
    const subscriptions = await subscriptionModel.getAllSubscriptions();
    return subscriptions;
}

async function getSubscription(subscriptionId) {
    const subscription = await subscriptionModel.getSubscription(subscriptionId);
    if (!subscription) throw appError("SUBSCRIPTION_NOT_FOUND", 'subscription not found', 404)
    return subscription;
}

async function updateSubscription(subscriptionId, tenantId, body) {
    const subscription = await subscriptionModel.getSubscription(subscriptionId);
    if (!subscription) throw appError("SUBSCRIPTION_NOT_FOUND", 'subscription not found', 404)

    const subscriptionUpdated = await subscriptionModel.updateSubscription(subscriptionId, tenantId, body);
    if (!subscriptionUpdated) throw appError("SUBSCRIPTION_NOT_UPDATED", 'subscription not updated', 400)
    return subscriptionUpdated;
}
export default {
    createSubscription,
    getAllSubscriptions,
    getSubscription,
    updateSubscription
}