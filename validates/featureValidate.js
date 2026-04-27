import Joi from 'joi';

const createFeatureSchema = Joi.object({
    name: Joi.string().required(),
    code: Joi.string().required(), // e.g. "reports_module"
    description: Joi.string().optional()
});

function createFeature(req, res, next) {
    const { error, value } = createFeatureSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

const assignFeatureSchema = Joi.object({
    feature_id: Joi.number().positive().required()
});

function assignFeature(req, res, next) {
    const { error, value } = assignFeatureSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

export default {
    createFeature,
    assignFeature
};
