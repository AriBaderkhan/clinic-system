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

function createUser(req, res, next) {
    const { error } = schemacreateUser.validate(req.body);
    if (error) return res.status(400).send(error.details[0].message)
    next();
}

export default { createUser }