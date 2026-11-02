import Joi from 'joi';

const createFeatureSchema = Joi.object({
    name: Joi.string().required(),
    code: Joi.string().required(), // e.g. "reports_module"
    description: Joi.string().optional()
});

function create(req, res, next) {
    const { error, value } = createFeatureSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

const assignFeatureSchema = Joi.object({
    feature_id: Joi.number().positive().required()
});

function assign(req, res, next) {
    const { error, value } = assignFeatureSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

// per-clinic extra: which feature, optionally until when, and why
const grantSchema = Joi.object({
    feature_id: Joi.number().integer().positive().required(),
    expires_at: Joi.date().iso().allow(null).optional(),
    note: Joi.string().trim().max(200).allow('', null).optional(),
}).unknown(false);

function grant(req, res, next) {
    const { error, value } = grantSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' });
    req.body = value;
    next();
}

export default { create, assign, grant };