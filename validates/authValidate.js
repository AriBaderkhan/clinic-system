import Joi from 'joi';


const schemaLogin = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(3).required(),
    branch_id: Joi.number().optional()
})

function validateLogin(req, res, next) {
    const { error } = schemaLogin.validate(req.body);
    if (error) return res.status(400).send(error.details[0].message)
    next();
}


export default { validateLogin }