import subscriptionModel from "../models/subscriptionModel.js";
import subscriptionRequestModel from "../models/subscriptionRequestModel.js";
import appError from '../utils/appError.js';
import planModel from '../models/planModel.js';
import cents from '../utils/money.js';

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

// ---- what one period costs ----
// plan price (or the clinic's LOCKED price when it stays on the same plan)
// + every doctor over the included number x the plan's extra-doctor price.
// -1 = unlimited doctors / no extra doctors on this plan. Pure: no database.
export function priceFor(plan, billing_period, doctors, lock = null) {
    const yearly = billing_period === 'yearly';
    const locked = lock && lock.locked_price != null;
    const base = locked ? (yearly ? lock.locked_yearly_price : lock.locked_price) : (yearly ? plan.yearly_price : plan.price);
    const included = locked && lock.locked_included_doctors != null ? Number(lock.locked_included_doctors) : Number(plan.included_doctors);
    const extraUnit = Number(yearly ? plan.extra_doctor_yearly_price : plan.extra_doctor_price);
    const extra = included === -1 ? 0 : Math.max(0, doctors - included);
    const extraCents = extra > 0 && extraUnit >= 0 ? extra * cents(extraUnit) : 0;
    return {
        base: Number(base),
        included_doctors: included,             // -1 = unlimited
        doctors,
        extra_doctors: extra,
        extra_doctor_price: extraUnit,          // -1 = no extra doctors on this plan
        total: (cents(base) + extraCents) / 100,
        price_locked: !!locked,
    };
}

// the lock only counts while the clinic stays on its plan
const lockFor = (sub, plan_id) => (sub && Number(sub.plan_id) === Number(plan_id) ? sub : null);

// Before a person gets a role that treats patients: on a plan WITHOUT an extra-doctor price,
// the included number is a hard limit. (With an extra price, each extra doctor is simply billed.)
async function assertDoctorSeat(tenant_id, user_id = null) {
    const sub = await subscriptionModel.getByTenant(tenant_id);
    if (!sub) return;
    if (user_id && await subscriptionModel.isCountedDoctor(user_id, tenant_id)) return; // already counted (other branch)
    const doctors = await subscriptionModel.countActiveDoctors(tenant_id);
    const p = priceFor(sub, sub.billing_period || 'monthly', doctors + 1, sub);
    if (p.extra_doctors > 0 && p.extra_doctor_price < 0) {
        throw appError('PLAN_DOCTOR_LIMIT', `Your plan includes ${p.included_doctors} doctors. Upgrade to add more.`, 403, { limit: p.included_doctors });
    }
}

// What a renewal / plan change would cost right now (the clinic's screen shows this before paying).
async function quote(tenant_id, plan_id, billing_period) {
    const plan = await planModel.getPlanById(plan_id);
    if (!plan) throw appError('PLAN_NOT_FOUND', 'Plan not found', 404);
    const [sub, doctors] = await Promise.all([subscriptionModel.getByTenant(tenant_id), subscriptionModel.countActiveDoctors(tenant_id)]);
    return { plan_id: plan.id, plan_name: plan.name, billing_period, ...priceFor(plan, billing_period, doctors, lockFor(sub, plan.id)) };
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
    const doctors = await subscriptionModel.countActiveDoctors(tenant_id);
    const usage = sub ? priceFor(sub, sub.billing_period || 'monthly', doctors, sub) : null;
    return {
        plan_id: sub?.plan_id || null,
        plan_name: sub?.plan_name || null,
        price: sub?.plan_price ?? null,
        yearly_price: sub?.plan_yearly_price ?? null,
        billing_period: sub?.billing_period || null,   // monthly | yearly
        max_branches: sub?.max_branches ?? null,
        max_users: sub?.max_users ?? null,
        // doctors: how many, how many included, extra price, what the next period costs
        doctors_used: doctors,
        included_doctors: usage?.included_doctors ?? null,
        extra_doctor_price: usage?.extra_doctor_price ?? null,
        next_period_total: usage?.total ?? null,
        price_locked: usage?.price_locked ?? false,
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

export default { create, getAll, getById, update, getMyStatus, getMyFeatures, computeState, quote, assertDoctorSeat }