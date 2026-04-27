import planModel from '../models/planModel.js';
import appError from '../utils/appError.js';


async function createPlan(body) {
    const plan = await planModel.createPlan(body);
    if (!plan) throw appError('PLAN_NOT_CREATED', 'Plan not created', 404);
    return plan;
}

async function getPlans() {
    const plans = await planModel.getPlans();
    return plans;
}

async function getPlanById(id) {
    const plan = await planModel.getPlanById(id);
    if (!plan) throw appError('PLAN_NOT_FOUND', 'Plan not found', 404);
    return plan;
}

async function updatePlan(id, body) {
    const plan = await planModel.getPlanById(id);
    if (!plan) throw new appError('PLAN_NOT_FOUND', 'Plan not found', 404);

    const updatedPlan = await planModel.updatePlan(id, body);
    if (!updatedPlan) throw appError('PLAN_NOT_FOUND', 'Plan not found', 404);
    return updatedPlan;
}

async function deletePlan(id) {
    const plan = await planModel.getPlanById(id);
    if (!plan) throw new appError('PLAN_NOT_FOUND', 'Plan not found', 404);

    const deletedPlan = await planModel.deletePlan(id);
    if (!deletedPlan) throw appError('PLAN_NOT_FOUND', 'Plan not found', 404);
    return deletedPlan;
}

export default { createPlan, getPlans, getPlanById, updatePlan, deletePlan };