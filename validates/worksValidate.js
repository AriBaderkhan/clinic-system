import Joi from "joi";


const workValidateSchema = Joi.object({
    code: Joi.string().required(),
    name: Joi.string().required(),
    min_price: Joi.number().required(),
    allow_installments: Joi.boolean().required(),
    min_installment_amount: Joi.number().when('allow_installments', { is: true, then: Joi.required(), otherwise: Joi.forbidden() }),
    is_active: Joi.boolean().default(true),
    is_plan: Joi.boolean().default(false),
    is_whole_mouth: Joi.boolean().default(false)
});

function create(req, res, next) {
    const { error, value } = workValidateSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

const workUpdateSchema = Joi.object({
    code: Joi.string().optional(),
    name: Joi.string().optional(),
    min_price: Joi.number().optional(),
    allow_installments: Joi.boolean().optional(),
    min_installment_amount: Joi.number().when('allow_installments', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
    is_active: Joi.boolean().optional(),
    is_plan: Joi.boolean().optional(),
    is_whole_mouth: Joi.boolean().optional()
});

function update(req, res, next) {
    const { error, value } = workUpdateSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

export default {
    create,
    update
}