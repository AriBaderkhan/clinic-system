import planModel from '../models/planModel.js';
import featureModel from '../models/featureModel.js';
import appError from '../utils/appError.js';

async function create(body) {
    const plan = await planModel.createPlan(body);
    if (!plan) throw appError('PLAN_NOT_CREATED', 'Plan not created', 404);
    return plan;
}

async function getAll() {
    const plans = await planModel.getPlans();
    return plans;
}

// Public pricing: every plan with its assigned features (for the marketing site
// and the signup page). No auth — read-only marketing data.
async function getPublic() {
    const plans = await planModel.getPlans();
    return Promise.all(
        plans.map(async (plan) => ({
            ...plan,
            features: await featureModel.getPlanFeatures(plan.id),
        }))
    );
}

async function getById(id) {
    const plan = await planModel.getPlanById(id);
    if (!plan) throw appError('PLAN_NOT_FOUND', 'Plan not found', 404);
    return plan;
}

async function update(id, body) {
    const plan = await planModel.getPlanById(id);
    if (!plan) throw new appError('PLAN_NOT_FOUND', 'Plan not found', 404);

    const updatedPlan = await planModel.updatePlan(id, body);
    if (!updatedPlan) throw appError('PLAN_NOT_FOUND', 'Plan not found', 404);
    return updatedPlan;
}

async function _delete(id) {
    const plan = await planModel.getPlanById(id);
    if (!plan) throw new appError('PLAN_NOT_FOUND', 'Plan not found', 404);

    const deletedPlan = await planModel.deletePlan(id);
    if (!deletedPlan) throw appError('PLAN_NOT_FOUND', 'Plan not found', 404);
    return deletedPlan;
}

export default { create, getAll, getPublic, getById, update, delete: _delete };