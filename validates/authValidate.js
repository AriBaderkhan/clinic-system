import Joi from 'joi';

const schemaRegister = Joi.object({
    full_name: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(3).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({ 'any.only': 'confirmPassword must match password' }),
    role: Joi.string().valid('doctor', 'super_doctor', 'reception', 'owner').required(),
    phone: Joi.string().optional(),
    address: Joi.string().optional(),
    room: Joi.when('role', {
        is: 'doctor',
        then: Joi.number().required(),
        otherwise: Joi.forbidden()
    }),
    // badge_no: Joi.when('role', {
    //     is: 'assistant',
    //     then: Joi.string().trim().required(),
    //     otherwise: Joi.forbidden()
    // }),
    // doctor_name: Joi.when('role', {
    //     is: 'assistant',
    //     then: Joi.string().trim().required(),
    //     otherwise: Joi.forbidden()
    // }),
})

function validateRegistration(req, res, next) {
    const { error } = schemaRegister.validate(req.body);
    if (error) return res.status(400).send(error.details[0].message)
    next();
}

const schemaLogin = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(3).required(),
})

function validateLogin(req, res, next) {
    const { error } = schemaLogin.validate(req.body);
    if (error) return res.status(400).send(error.details[0].message)
    next();
}


export default {  validateRegistration , validateLogin }