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


export default { validateCreateSession, validateUpdateSession }