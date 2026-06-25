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

// Tenant renew/upgrade request — multipart: plan_id (text) + the evidence image.
// Runs AFTER the upload middleware, so plan_id is already on req.body as a string.
const requestSchema = Joi.object({
    plan_id: Joi.number().positive().required(),
    note: Joi.string().allow('', null).optional(),
})

function request(req, res, next) {
    const { error, value } = requestSchema.validate(req.body)
    if (error) return res.status(400).json({ message: error.details[0].message })
    req.body = value
    next()
}

export default { create, update, request }