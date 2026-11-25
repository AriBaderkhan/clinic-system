import Joi from 'joi';

// payment history pages
const paymentsSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
}).unknown(false);

function payments(req, res, next) {
    const { error, value } = paymentsSchema.validate(req.query);
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' });
    req.paging = value;
    next();
}

export default { payments };
