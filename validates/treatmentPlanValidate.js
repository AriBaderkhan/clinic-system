import Joi from 'joi';

const editTpSchema = Joi.object({
    type: Joi.string().valid("ortho", "implant", "rct", "re_rct").optional(),
    agreed_total: Joi.number().min(0).optional(),

}).min(1);

function validateEditTp(req, res, next) {
    const { error } = editTpSchema.validate(req.body, {
        abortEarly: true,
        convert: true,        // allow "200000" -> 200000
        stripUnknown: true,   // removes unexpected fields
    });
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

export default { validateEditTp }