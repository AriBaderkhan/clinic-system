import Joi from 'joi';

// -1 = unlimited for max_branches / max_users / included_doctors;
// extra_doctor_price -1 = no extra doctors on this plan (upgrade instead)
const fields = {
    name: Joi.string().trim(),
    max_branches: Joi.number().integer().min(-1),
    max_users: Joi.number().integer().min(-1),             // staff are not counted any more
    price: Joi.number().min(0),                            // monthly price
    yearly_price: Joi.number().min(0),
    included_doctors: Joi.number().integer().min(-1),
    extra_doctor_price: Joi.number().min(-1),              // per month
    extra_doctor_yearly_price: Joi.number().min(-1),       // per year
    sort_order: Joi.number().integer().min(0).max(1000),
};

// a new plan: name, branches and prices are needed; the rest starts as "unlimited / none"
const planCreateSchema = Joi.object({
    ...fields,
    name: fields.name.required(),
    max_branches: fields.max_branches.required(),
    price: fields.price.required(),
    yearly_price: fields.yearly_price.required(),
    max_users: fields.max_users.default(-1),
    included_doctors: fields.included_doctors.default(-1),
    extra_doctor_price: fields.extra_doctor_price.default(-1),
    extra_doctor_yearly_price: fields.extra_doctor_yearly_price.default(-1),
    sort_order: fields.sort_order.default(0),
});

function create(req, res, next) {
    const { error, value } = planCreateSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
    req.body = value;
    next()
}

// an update changes only what is sent (no defaults filled in)
const planUpdateSchema = Joi.object(fields);

function update(req, res, next) {
    const { error, value } = planUpdateSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
    req.body = value;
    next()
}

export default { create, update };
