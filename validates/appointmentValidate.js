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
    complaint: Joi.string().max(1000).allow('', null).optional(),
})

function create(req, res, next) {
    const { error } = schemaAppointmentAdd.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

// Update
const schemaAppointmentUpdate = schemaAppointmentAdd
    .fork(['patient_id', 'doctor_id', 'scheduled_start'], (field) => field.optional())
    .keys({
        appointment_type: Joi.forbidden(),
    })
    .min(1)


function update(req, res, next) {
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
function cancel(req, res, next) {
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
                tooth_number: Joi.number().integer().min(11).max(85).allow(null),
                // For a treatment-plan work, the doctor either continues an
                // existing plan (treatment_plan_id) OR starts a new one (agreed_total).
                treatment_plan_id: Joi.number().integer().positive().allow(null),
                agreed_total: Joi.number().min(0).allow(null),
                // whole-mouth region: 'upper' | 'lower' (absent/null = whole mouth)
                arch: Joi.string().valid('upper', 'lower').allow(null).optional(),
            })
        )
        .min(1)
        .required(),

    // existing active plans the doctor ticked "mark completed" for
    completedPlanIds: Joi.array().items(Joi.number().integer().positive()).optional(),

    // optional prescription written during the visit
    prescription: Joi.array().items(
        Joi.object({
            drug_name: Joi.string().trim().min(1).required(),
            dosage: Joi.string().trim().allow('', null).optional(),
            frequency: Joi.string().trim().allow('', null).optional(),
            duration: Joi.string().trim().allow('', null).optional(),
            instructions: Joi.string().trim().allow('', null).optional(),
        })
    ).optional(),
});

function complete(req, res, next) {
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

    q: Joi.string().trim().min(1).max(100).optional(),

    page: Joi.number().integer().min(1).optional(),

    limit: Joi.number().integer().min(1).max(100).optional(),

}).unknown(false)

function filters(req, res, next) {
    const { error } = listApptsFiltersSchema.validate(req.query);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

// Visit draft — complaint + notes + next_plan saved mid-visit (all optional, can be empty)
const schemaVisitDraft = Joi.object({
    complaint: Joi.string().max(1000).allow('', null),
    notes: Joi.string().max(1000).allow('', null),
    next_plan: Joi.string().max(300).allow('', null),
}).min(1);

function visitDraft(req, res, next) {
    const { error } = schemaVisitDraft.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

export default {
    create, update, cancel, complete, filters, visitDraft
}