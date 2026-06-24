import Joi from 'joi';

const schemaPatientAdd = Joi.object({
    name: Joi.string().trim().min(2).required().messages({
        'string.empty': 'Name is required',
        'string.min': 'Name must be at least 2 characters'
    }),
    phone: Joi.string().pattern(/^[0-9]{10,15}$/).required().messages({
        'string.pattern.base': 'Phone must contain only numbers (10–15 digits)'
    }),
    age: Joi.number().min(3).required().messages({
        'number.min': 'Age must be at least 3'
    }),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    address: Joi.string().trim().optional(),
    // Tier 3 medical fields (all optional)
    allergies: Joi.string().trim().allow('', null).optional(),
    chronic_diseases: Joi.string().trim().allow('', null).optional(),
    blood_type: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-').allow('', null).optional()
})

function create(req, res, next) {
    const { error, value } = schemaPatientAdd.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

const schemaPatientUpdate = schemaPatientAdd.fork(['name', 'phone', 'age', 'gender', 'address'], (field) => field.optional());

function update(req, res, next) {
    const { error, value } = schemaPatientUpdate.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) return res.status(400).json({ message: error.details[0].message })
    req.body = value;
    next();
}

export default { create, update }