import Joi from 'joi';

const schemaSessionAdd = Joi.object({
    case_id: Joi.number().required(),
    complaint: Joi.string().optional(),
    diagnosis: Joi.string().optional(),
    next_plan: Joi.string().optional(),
    notes: Joi.string().optional(),
});

function validateCreateSession(req, res, next) {
    const { error } = schemaSessionAdd.validate(req.body);
    if (error) return res.status(400).send(error.details[0].message)
    next();
}

const schemaSessionUpdate = schemaSessionAdd
    .fork(['complaint', 'diagnosis', 'next_plan', 'notes'], (field) => field.optional())
    .fork(['case_id'], (field) => field.forbidden())
    .min(1);

function validateUpdateSession(req, res, next) {
    const { error } = schemaSessionUpdate.validate(req.body);
    if (error) return res.status(400).send(error.details[0].message)
    next();
}


const schemaEditSession = Joi.object({
    next_plan: Joi.string().min(3).max(300).allow('', null).optional(), // optional
    notes: Joi.string().max(1000).allow('', null).optional(),           // optional
    works: Joi.array()
        .items(
            Joi.object({
                work_id: Joi.number().integer().positive().required(),
                quantity: Joi.number().integer().positive().min(1).required(),
                tooth_number: Joi.number().integer().min(11).max(48).allow(null),
            })
        )
        .min(1)
        .optional(),
    total_paid: Joi.number().positive().optional()
});

function validateEditSession(req, res, next) {
    const { error } = schemaEditSession.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}


const listSessionsFiltersSchema = Joi.object({
    day: Joi.string()
        .valid("today", "yesterday", "last_week", "last_month")
        .optional(),

    search: Joi.string()
        .trim()
        .min(1)
        .max(100)
        .optional(),

}).unknown(false).optional()

function validateListASessionFilters(req, res, next) {
    const { error } = listSessionsFiltersSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

export default { validateCreateSession, validateUpdateSession, validateEditSession,validateListASessionFilters}