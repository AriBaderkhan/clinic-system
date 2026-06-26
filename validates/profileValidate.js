import Joi from 'joi';

// Runs AFTER the upload middleware, so text fields are strings on req.body.
const updateSchema = Joi.object({
    full_name: Joi.string().min(2).max(255).required(),
    phone: Joi.string().allow('', null).max(50),
    address: Joi.string().allow('', null),
});
function update(req, res, next) {
    const { error, value } = updateSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

const passwordSchema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).max(100).required(),
});
function password(req, res, next) {
    const { error, value } = passwordSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

const emailSendSchema = Joi.object({ email: Joi.string().email().required() });
function emailSend(req, res, next) {
    const { error, value } = emailSendSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

const emailChangeSchema = Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string().pattern(/^\d{6}$/).required().messages({ 'string.pattern.base': 'Code must be 6 digits' }),
});
function emailChange(req, res, next) {
    const { error, value } = emailChangeSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

export default { update, password, emailSend, emailChange };
