import Joi from 'joi';

const createSubscriptionSchema = Joi.object({
    plan_id: Joi.number().positive().required()
})

function create(req, res, next) {
    const { error, value } = createSubscriptionSchema.validate(req.body)
    if (error) return res.status(400).json({ message: error.details[0].message })
    req.body = value
    next()
}

const updateSubscriptionSchema = Joi.object({
    plan_id: Joi.number().positive().optional(),
    status: Joi.string().optional(),
})

function update(req, res, next) {
    const { error, value } = updateSubscriptionSchema.validate(req.body)
    if (error) return res.status(400).json({ message: error.details[0].message })
    req.body = value
    next()
}

export default { create, update }