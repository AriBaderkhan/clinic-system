import Joi from "joi";

const specialtySchema = Joi.object({
    name: Joi.string().trim().min(1).max(60).required(),
    uses_teeth: Joi.boolean().strict().default(false),
});

function save(req, res, next) {
    const { error, value } = specialtySchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' });
    req.body = value;
    next();
}

export default { save }
