import Joi from 'joi';


const schemaEditSession = Joi.object({
    next_plan: Joi.string().min(3).max(300).allow('', null).optional(), // optional
    notes: Joi.string().max(1000).allow('', null).optional(),           // optional
    works: Joi.array()
        .items(
            Joi.object({
                work_id: Joi.number().integer().positive().required(),
                quantity: Joi.number().integer().positive().min(1).required(),
                tooth_number: Joi.number().integer().min(11).max(85).allow(null),
                // for adding treatment-plan works during an edit:
                treatment_plan_id: Joi.number().integer().positive().allow(null).optional(),
                agreed_total: Joi.number().positive().allow(null).optional(),
            })
        )
        .min(1)
        .optional(),
    total_paid: Joi.number().min(0).optional(),
    // optional prescription edited alongside the works
    prescription: Joi.array().items(
        Joi.object({
            drug_name: Joi.string().trim().min(1).required(),
            dosage: Joi.string().trim().allow('', null).optional(),
            frequency: Joi.string().trim().allow('', null).optional(),
            duration: Joi.string().trim().allow('', null).optional(),
            instructions: Joi.string().trim().allow('', null).optional(),
        })
    ).optional()
});

function edit(req, res, next) {
    const { error } = schemaEditSession.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}


const listSessionsFiltersSchema = Joi.object({
    day: Joi.string().valid("today", "yesterday", "last_week", "last_month").optional(),
    q: Joi.string().trim().min(1).max(100).optional(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
}).unknown(false)

function filters(req, res, next) {
    const { error } = listSessionsFiltersSchema.validate(req.query);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

export default { edit, filters }