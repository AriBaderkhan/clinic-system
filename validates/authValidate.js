import Joi from 'joi';


const schemaLogin = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(3).required(),
    branch_id: Joi.number().optional()
})

function login(req, res, next) {
    const { error } = schemaLogin.validate(req.body);
    if (error) return res.status(400).send(error.details[0].message)
    next();
}

const schemaForgot = Joi.object({
    email: Joi.string().email().required(),
})
function forgotPassword(req, res, next) {
    const { error } = schemaForgot.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

const schemaReset = Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string().pattern(/^\d{6}$/).required().messages({ 'string.pattern.base': 'Code must be 6 digits' }),
    newPassword: Joi.string().min(6).max(100).required(),
})
function resetPassword(req, res, next) {
    const { error } = schemaReset.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}


export default { login, forgotPassword, resetPassword }