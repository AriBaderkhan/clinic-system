import Joi from 'joi';

// -1 = unlimited for max_branches / max_users
const planCreateSchema = Joi.object({
    name: Joi.string().trim().required(),
    max_branches: Joi.number().integer().min(-1).required(),
    max_users: Joi.number().integer().min(-1).required(),
    price: Joi.number().min(0).required(),          // monthly price
    yearly_price: Joi.number().min(0).required(),
});

function create(req, res, next) {
    const { error, value } = planCreateSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
    req.body = value;
    next()
}

const planUpdateSchema = planCreateSchema.fork(['name', 'max_branches', 'max_users', 'price', 'yearly_price'], (field) => field.optional());

function update(req, res, next) {
    const { error, value } = planUpdateSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
    req.body = value;
    next()
}

export default { create, update };
