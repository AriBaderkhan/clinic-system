import subscriptionModel from "../models/subscriptionModel.js";
import subscriptionRequestModel from "../models/subscriptionRequestModel.js";
import appError from '../utils/appError.js';

// Length of a paid period = value + a 7-day buffer. Monthly 30+7, yearly 365+7.
// The ONE place period length is decided (renewals, registration, admin-add).
export const PERIOD_DAYS = { monthly: 37, yearly: 372 };
// Tenant sees the renewal banner once they're inside this many days of the end.
export const RENEWAL_WINDOW_DAYS = 7;

// Derive the lifecycle state from the subscription's end_date.
// none | active | expiring (<= window) | expired
function computeState(sub) {
    if (!sub) return { state: 'none', days_left: null };
    if (!sub.end_date) return { state: 'active', days_left: null }; // legacy rows w/o expiry
    const now = Date.now();
    const end = new Date(sub.end_date).getTime();
    const days_left = Math.ceil((end - now) / 86400000);
    let state;
    if (now > end) state = 'expired';
    else if (days_left <= RENEWAL_WINDOW_DAYS) state = 'expiring';
    else state = 'active';
    return { state, days_left };
}

async function create(tenantId, planId) {
    const subscription = await subscriptionModel.createSubscription(tenantId, planId, PERIOD_DAYS.monthly, 'monthly');
    if (!subscription) throw appError("SUBSCRIPTION_NOT_CREATED", 'subscription not created', 400)
    return subscription;
}

async function getAll() {
    const subscriptions = await subscriptionModel.getAllSubscriptions();
    return subscriptions;
}

async function getById(subscriptionId) {
    const subscription = await subscriptionModel.getSubscription(subscriptionId);
    if (!subscription) throw appError("SUBSCRIPTION_NOT_FOUND", 'subscription not found', 404)
    return subscription;
}

async function update(subscriptionId, tenantId, body) {
    const subscription = await subscriptionModel.getSubscription(subscriptionId);
    if (!subscription) throw appError("SUBSCRIPTION_NOT_FOUND", 'subscription not found', 404)

    const subscriptionUpdated = await subscriptionModel.updateSubscription(subscriptionId, tenantId, body);
    if (!subscriptionUpdated) throw appError("SUBSCRIPTION_NOT_UPDATED", 'subscription not updated', 400)
    return subscriptionUpdated;
}

// Tenant self-service: current plan + lifecycle state + days left + pending flag.
async function getMyStatus(tenant_id) {
    const sub = await subscriptionModel.getByTenant(tenant_id);
    const { state, days_left } = computeState(sub);
    const pending = await subscriptionRequestModel.getPendingByTenant(tenant_id);
    return {
        plan_id: sub?.plan_id || null,
        plan_name: sub?.plan_name || null,
        price: sub?.plan_price ?? null,
        yearly_price: sub?.plan_yearly_price ?? null,
        billing_period: sub?.billing_period || null,   // monthly | yearly
        max_branches: sub?.max_branches ?? null,
        max_users: sub?.max_users ?? null,
        status: state,                 // none | active | expiring | expired
        start_date: sub?.start_date || null,
        end_date: sub?.end_date || null,
        days_left,
        // Renew only once the value is (nearly) used up — last 7 days or expired.
        can_renew: state === 'expiring' || state === 'expired' || state === 'none',
        in_warning: state === 'expiring' || state === 'expired',
        pending_request: pending
            ? { id: pending.id, plan_id: pending.plan_id, plan_name: pending.plan_name, billing_period: pending.billing_period, created_at: pending.created_at }
            : null,
    };
}

// Feature codes the tenant's plan includes (frontend hides what's not here).
async function getMyFeatures(tenant_id) {
    return subscriptionModel.getTenantFeatureCodes(tenant_id);
}

export default { create, getAll, getById, update, getMyStatus, getMyFeatures, computeState }