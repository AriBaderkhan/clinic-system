import Joi from 'joi';

const ROLES = ['tenant_manager', 'branch_manager', 'doctor', 'reception'];

// Runs AFTER the upload middleware, so text fields are strings on req.body.
const createSchema = Joi.object({
    title: Joi.string().min(2).max(255).required(),
    body: Joi.string().allow('', null),
    target_plan_id: Joi.number().positive().allow('', null), // empty = all plans
    // multipart sends repeated fields as an array, or a single string; none = all roles
    target_roles: Joi.alternatives().try(
        Joi.array().items(Joi.string().valid(...ROLES)),
        Joi.string().valid(...ROLES)
    ).optional(),
});

function create(req, res, next) {
    const { error, value } = createSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

export default { create };
