import Joi from "joi";

const reportMonthQuerySchema = Joi.object({
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
    from: Joi.date().iso(),
    to: Joi.date().iso().min(Joi.ref('from')),
}).or('month', 'from');

function monthly(req, res, next) {
    const { error } = reportMonthQuerySchema.validate(req.query, {
        abortEarly: true,
        stripUnknown: true,
    });

    if (error) {
        return res.status(400).json({
            ok: false,
            error: "VALIDATION_ERROR",
            message: error.details[0].message,
        });
    }

    next();
}

export default { monthly }