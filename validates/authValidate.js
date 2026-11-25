import Joi from 'joi';


// login keeps accepting existing short passwords; the 6-character rule applies when a password is SET
const schemaLogin = Joi.object({
    email: Joi.string().trim().email().required(),
    password: Joi.string().min(3).required(),
    branch_id: Joi.number().optional()
})

function login(req, res, next) {
    const { error, value } = schemaLogin.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' });
    req.body = value;
    next();
}

const schemaForgot = Joi.object({
    email: Joi.string().trim().email().required(),
})
function forgotPassword(req, res, next) {
    const { error, value } = schemaForgot.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' });
    req.body = value;
    next();
}

const schemaReset = Joi.object({
    email: Joi.string().trim().email().required(),
    code: Joi.string().pattern(/^\d{6}$/).required().messages({ 'string.pattern.base': 'Code must be 6 digits' }),
    newPassword: Joi.string().min(6).max(100).required(),
})
function resetPassword(req, res, next) {
    const { error, value } = schemaReset.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' });
    req.body = value;
    next();
}


export default { login, forgotPassword, resetPassword }