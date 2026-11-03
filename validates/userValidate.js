import Joi from 'joi';

const schemacreateUser = Joi.object({
    branch_id: Joi.number().positive().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(3).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({ 'any.only': 'confirmPassword must match password' }),
    role_id: Joi.number().positive().required(),
    full_name: Joi.string().required(),
    phone: Joi.string().optional(),
    address: Joi.string().optional(),
    is_active: Joi.boolean().optional().default(true),
    room: Joi.number().positive().optional().default(1),
})

function create(req, res, next) {
    const { error, value } = schemacreateUser.validate(req.body);
    if (error) return res.status(400).send(error.details[0].message)
    req.body = value; // apply the defaults (is_active: true, room: 1) — without this a new user was saved inactive
    next();
}

// a role in a branch (new branch = added, branch the user already works in = role changed)
const schemaAssign = Joi.object({
    branch_id: Joi.number().integer().positive().required(),
    role_id: Joi.number().integer().positive().required(),
})

function assign(req, res, next) {
    const { error, value } = schemaAssign.validate(req.body);
    if (error) return res.status(400).json({ code: 'VALIDATION_ERROR', message: error.details[0].message });
    req.body = value;
    next();
}

export default { create, assign }