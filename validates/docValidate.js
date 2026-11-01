import Joi from "joi";

// specialty_id null = no specialty (the doctor sees every treatment)
const settingsSchema = Joi.object({
    specialty_id: Joi.number().integer().positive().allow(null).required(),
    extra_work_ids: Joi.array().items(Joi.number().integer().positive()).max(200).default([]),
});

function settings(req, res, next) {
    const { error, value } = settingsSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' });
    req.body = value;
    next();
}

export default { settings }
