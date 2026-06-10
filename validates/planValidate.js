import Joi from 'joi';

const planCreateSchema = Joi.object({
    name: Joi.string().required(),
    max_branches: Joi.number().positive().required(),
    max_users: Joi.number().positive().required(),
    price: Joi.number().required(),
});

function create(req, res, next) {
    const { errors } = planCreateSchema.validate(req.body)
    if (errors) return res.status(400).json({ errors: errors.details })
    next()
}

const planUpdateSchema = planCreateSchema.fork(['name', 'max_branches', 'max_users', 'price'], (field) => field.optional());

function update(req, res, next) {
    const { errors } = planUpdateSchema.validate(req.body)
    if (errors) return res.status(400).json({ errors: errors.details })
    next()
}

export default { create, update };