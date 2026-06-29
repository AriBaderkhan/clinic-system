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

// Insights assistant query: a main period (month OR from/to) plus an optional
// comparison (compare flag, compareMonth, or compareFrom/compareTo).
const insightQuerySchema = Joi.object({
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
    from: Joi.date().iso(),
    to: Joi.date().iso().min(Joi.ref('from')),
    compare: Joi.string().valid('true', 'false', '1', '0'),
    compareMonth: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
    compareFrom: Joi.date().iso(),
    compareTo: Joi.date().iso().min(Joi.ref('compareFrom')),
}).or('month', 'from');

function insight(req, res, next) {
    const { error } = insightQuerySchema.validate(req.query, {
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

export default { monthly, insight }