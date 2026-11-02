import Joi from "joi";

const shareSchema = Joi.object({
    branch_id: Joi.number().integer().positive().required(),
}).unknown(false);

// same phone rule as adding a patient
const phoneSchema = Joi.object({
    phone: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
}).unknown(false);

const send400 = (res, error) => res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' });

function share(req, res, next) {
    const { error, value } = shareSchema.validate(req.body);
    if (error) return send400(res, error);
    req.body = value;
    next();
}

function phone(req, res, next) {
    const { error } = phoneSchema.validate(req.query);
    if (error) return send400(res, error);
    next();
}

export default { share, phone }
