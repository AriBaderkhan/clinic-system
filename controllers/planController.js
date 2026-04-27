import planService from '../services/planService.js';
import asyncWrap from '../utils/asyncWrap.js';


const createPlan = asyncWrap(async (req, res) => {
    const plan = await planService.createPlan(req.body);
    res.status(201).json({ message: 'Plan created successfully', data: plan });
})

const getPlans = asyncWrap(async (req, res) => {
    const plans = await planService.getPlans();
    res.status(200).json({ data: plans });
})

const getPlanById = asyncWrap(async (req, res) => {
    const plan = await planService.getPlanById(Number(req.params.planId));
    res.status(200).json({ data: plan });
})

const updatePlan = asyncWrap(async (req, res) => {
    const plan = await planService.updatePlan(Number(req.params.planId), req.body);
    res.status(200).json({ message: 'Plan updated successfully', data: plan });
})

const deletePlan = asyncWrap(async (req, res) => {
    const plan = await planService.deletePlan(Number(req.params.planId));
    res.status(200).json({ message: 'Plan deleted successfully', data: plan });
})

export default { createPlan, getPlans, getPlanById, updatePlan, deletePlan };