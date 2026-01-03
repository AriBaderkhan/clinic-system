import Joi from "joi";

const reportMonthQuerySchema = Joi.object({
    month: Joi.string()
        .required()
        .pattern(/^\d{4}-\d{2}-01$/)
        .custom((value, helpers) => {
            const input = new Date(`${value}T00:00:00Z`);
            if (Number.isNaN(input.getTime())) {
                return helpers.error("any.custom", {
                    message: "month must be a valid date"
                });
            }

            // normalize input month
            const inputMonth = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), 1
            ));

            // normalize current month
            const now = new Date();
            const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1
            ));

            // block future months
            if (inputMonth > currentMonth) {
                return helpers.error("any.custom", {
                    message: "month cannot be in the future"
                });
            }

            return value;
        })
});

function validateReportMonthly(req, res, next) {
    const { error, value } = reportMonthQuerySchema.validate(req.query, {
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

export default { validateReportMonthly }
