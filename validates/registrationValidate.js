import Joi from 'joi';

const sendCodeSchema = Joi.object({
    email: Joi.string().email().required(),
});
function sendCode(req, res, next) {
    const { error, value } = sendCodeSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

const verifyCodeSchema = Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string().pattern(/^\d{6}$/).required().messages({ 'string.pattern.base': 'Code must be 6 digits' }),
});
function verifyCode(req, res, next) {
    const { error, value } = verifyCodeSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

// Runs AFTER the upload middleware, so the text fields are strings on req.body.
const createSchema = Joi.object({
    tenant_name: Joi.string().min(2).max(255).required(),
    manager_name: Joi.string().min(2).max(255).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().allow('', null).max(50),
    address: Joi.string().allow('', null),
    password: Joi.string().min(6).max(100).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required()
        .messages({ 'any.only': 'Passwords do not match' }),
    plan_id: Joi.number().positive().required(),
});
function create(req, res, next) {
    const { error, value } = createSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

export default { sendCode, verifyCode, create };
