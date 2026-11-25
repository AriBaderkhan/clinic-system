import Joi from 'joi';

// activity log search: name text, from / to dates (YYYY-MM-DD), page
const listSchema = Joi.object({
    q: Joi.string().trim().max(100).allow(''),
    from: Joi.date().iso(),
    to: Joi.date().iso(),
    page: Joi.number().integer().min(1),
}).unknown(false);

function list(req, res, next) {
    const { error } = listSchema.validate(req.query);
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' });
    next();
}

export default { list };
