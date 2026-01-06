import Joi from 'joi';

// Create
const schemaAppointmentAdd = Joi.object({
    patient_id: Joi.number().integer().positive().required(),
    doctor_id: Joi.number().integer().positive().required(),
    appointment_type: Joi.string()
        .valid('normal', 'urgent', 'walk_in')
        .default('normal'),
    scheduled_start: Joi.date().iso().required().messages({
        'any.required': 'Appointment start time is required',
        'date.base': 'Appointment start time must be a valid ISO date'
    }),
})

function validateCreateAppointment(req, res, next) {
    const { error } = schemaAppointmentAdd.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

// Update
const schemaAppointmentUpdate = schemaAppointmentAdd
    .fork(['doctor_id', 'scheduled_start'], (field) => field.optional())
    .keys({
        appointment_type: Joi.forbidden(),
        patient_id: Joi.forbidden()
    })
    .min(1)


function validateUpdateAppointment(req, res, next) {
    const { error } = schemaAppointmentUpdate.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

// cancel
const schemaCancelReason = Joi.object({
    cancel_reason: Joi.string().min(3).max(300).required().messages({
        'any.required': 'A reason is required',
        'string.empty': 'Cancel reason cannot be empty',
        'string.min': 'Cancel reason must be at least 3 characters long',
        'string.max': 'Cancel reason cannot be longer than 300 characters'
    })
})
function validateCancelReason(req, res, next) {
    const { error } = schemaCancelReason.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

// complete part
const schemaCompleteFillWork = Joi.object({
    next_plan: Joi.string().min(3).max(300).allow('', null), // optional
    notes: Joi.string().max(1000).allow('', null),           // optional
    works: Joi.array()
        .items(
            Joi.object({
                work_id: Joi.number().integer().positive().required(),
                quantity: Joi.number().integer().positive().min(1).required(),
                tooth_number: Joi.number().integer().min(11).max(48).allow(null),
            })
        )
        .min(1)
        .required(),

    agreementTotals: Joi.object({
        ortho: Joi.number().min(0),
        implant: Joi.number().min(0),
        rct: Joi.number().min(0),
        re_rct: Joi.number().min(0),
    }).optional(),
    planCompletion: Joi.object({
        ortho: Joi.boolean(),
        implant: Joi.boolean(),
        rct: Joi.boolean(),
        re_rct: Joi.boolean(),
    }).optional().unknown(false)
});

function validateCompleteFillWork(req, res, next) {
    const { error } = schemaCompleteFillWork.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

const listApptsFiltersSchema = Joi.object({
    day: Joi.string()
        .valid("today", "yesterday", "last_week", "last_month")
        .optional(),

    type: Joi.string()
        .valid("normal", "urgent", "walk_in")
        .optional(),

    search: Joi.string()
        .trim()
        .min(1)
        .max(100)
        .optional(),

}).unknown(false)

function validateListApptsFilters(req, res, next) {
    const { error } = listApptsFiltersSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

export default {
    validateCreateAppointment, validateUpdateAppointment,
    validateCancelReason, validateCompleteFillWork, validateListApptsFilters
}