import Joi from 'joi';

// ===================== LABS =====================

const treatmentItem = Joi.object({
    work_id: Joi.number().integer().positive().required(),
    cost: Joi.number().min(0).required().messages({
        'any.required': 'Cost is required for each treatment',
        'number.min': 'Cost cannot be negative',
    }),
});

const schemaLabCreate = Joi.object({
    name: Joi.string().trim().min(2).max(150).required().messages({
        'any.required': 'Lab name is required',
        'string.min': 'Lab name must be at least 2 characters',
    }),
    phone: Joi.string().trim().max(30).allow('', null),
    treatments: Joi.array().items(treatmentItem).min(1).required().messages({
        'array.min': 'At least one treatment with a cost is required',
        'any.required': 'Treatments are required',
    }),
});

function createLab(req, res, next) {
    const { error } = schemaLabCreate.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

const schemaLabUpdate = Joi.object({
    name: Joi.string().trim().min(2).max(150),
    phone: Joi.string().trim().max(30).allow('', null),
    treatments: Joi.array().items(treatmentItem).min(1),
}).min(1);

function updateLab(req, res, next) {
    const { error } = schemaLabUpdate.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

// ===================== ORDERS =====================

const schemaOrderCreate = Joi.object({
    lab_id: Joi.number().integer().positive().required(),
    appointment_id: Joi.number().integer().positive(),
    patient_id: Joi.number().integer().positive(),
    doctor_id: Joi.number().integer().positive(),
    work_id: Joi.number().integer().positive().required(),
    quantity: Joi.number().integer().positive().min(1).max(1000).required(),
    notes: Joi.string().max(1000).allow('', null),
})
    // either an appointment (patient + doctor derived from it) or both ids directly
    .or('appointment_id', 'patient_id')
    .with('patient_id', 'doctor_id')
    .messages({
        'object.missing': 'Select an appointment (or a patient and a doctor)',
    });

function createOrder(req, res, next) {
    const { error } = schemaOrderCreate.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

const schemaOrderUpdate = Joi.object({
    patient_id: Joi.number().integer().positive(),
    doctor_id: Joi.number().integer().positive(),
    work_id: Joi.number().integer().positive(),
    quantity: Joi.number().integer().positive().min(1).max(1000),
    notes: Joi.string().max(1000).allow('', null),
}).min(1);

function updateOrder(req, res, next) {
    const { error } = schemaOrderUpdate.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

const schemaOrderStatus = Joi.object({
    status: Joi.string().valid('ordered', 'ready', 'delivered', 'cancelled').required(),
});

function orderStatus(req, res, next) {
    const { error } = schemaOrderStatus.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

const ordersFiltersSchema = Joi.object({
    status: Joi.string().valid('ordered', 'ready', 'delivered', 'cancelled').optional(),
    lab_id: Joi.number().integer().positive().optional(),
    q: Joi.string().trim().min(1).max(100).optional(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
}).unknown(false);

function ordersFilters(req, res, next) {
    const { error } = ordersFiltersSchema.validate(req.query);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

export default {
    createLab, updateLab,
    createOrder, updateOrder, orderStatus, ordersFilters,
};
