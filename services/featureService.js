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

export default { create, getAll, assign, remove, getPlanFeatures };