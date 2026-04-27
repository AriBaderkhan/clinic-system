import featureService from "../services/featureService.js";
import asyncWrap from '../utils/asyncWrap.js';

// Feature CRUD
const createFeature = asyncWrap(async (req, res) => {
    const feature = await featureService.createFeature(req.body);
    res.status(201).json(feature);
});

const getFeatures = asyncWrap(async (req, res) => {
    const features = await featureService.getFeatures();
    res.status(200).json(features);
});

// Plan Assignments
const assignFeature = asyncWrap(async (req, res) => {
    const planId = Number(req.params.planId);
    const { feature_id } = req.body;
    const result = await featureService.assignFeatureToPlan(planId, feature_id);
    res.status(201).json(result);
});

const removeFeature = asyncWrap(async (req, res) => {
    const planId = Number(req.params.planId);
    const featureId = Number(req.params.featureId);
    const result = await featureService.removeFeatureFromPlan(planId, featureId);
    res.status(200).json({ message: "Feature removed from plan", data: result });
});

const getPlanFeatures = asyncWrap(async (req, res) => {
    const planId = Number(req.params.planId);
    const features = await featureService.getPlanFeatures(planId);
    res.status(200).json(features);
});

export default {
    createFeature,
    getFeatures,
    assignFeature,
    removeFeature,
    getPlanFeatures
};
