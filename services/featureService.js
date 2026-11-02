import featureModel from "../models/featureModel.js";
import appError from '../utils/appError.js';

async function create(body) {
    const { name, code, description } = body;
    const feature = await featureModel.createFeature(name, code, description);
    if (!feature) throw appError("FEATURE_NOT_CREATED", 'feature not created', 400);
    return feature;
}

async function getAll() {
    return await featureModel.getFeatures();
}

async function assign(planId, featureId) {
    const assigned = await featureModel.assignFeatureToPlan(planId, featureId);
    if (!assigned) throw appError("ASSIGNMENT_FAILED", 'feature already assigned or invalid ids', 400);
    return assigned;
}

async function remove(planId, featureId) {
    const removed = await featureModel.removeFeatureFromPlan(planId, featureId);
    if (!removed) throw appError("REMOVE_FAILED", 'assignment not found', 404);
    return removed;
}

async function getPlanFeatures(planId) {
    return await featureModel.getPlanFeatures(planId);
}

// ---- per-clinic extras (trial / deal) ----
async function getTenantGrants(tenantId) {
    if (!await featureModel.tenantExists(tenantId)) throw appError('TENANT_NOT_FOUND', 'Clinic not found', 404);
    return featureModel.getTenantGrants(tenantId);
}

async function grant(tenantId, { feature_id, expires_at, note }, adminId) {
    if (!await featureModel.tenantExists(tenantId)) throw appError('TENANT_NOT_FOUND', 'Clinic not found', 404);
    if (!await featureModel.featureExists(feature_id)) throw appError('FEATURE_NOT_FOUND', 'Feature not found', 404);
    if (expires_at && new Date(expires_at) <= new Date()) throw appError('DATE_IN_PAST', 'The end date must be in the future', 400);
    return featureModel.upsertTenantGrant(tenantId, feature_id, expires_at || null, note || null, adminId);
}

async function revoke(tenantId, featureId) {
    const removed = await featureModel.removeTenantGrant(tenantId, featureId);
    if (!removed) throw appError('GRANT_NOT_FOUND', 'This clinic has no such extra', 404);
    return removed;
}

export default { create, getAll, assign, remove, getPlanFeatures, getTenantGrants, grant, revoke };