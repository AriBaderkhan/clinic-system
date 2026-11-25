import Joi from 'joi';

// a real time zone name (the settings screen lists the browser's own time zones)
const timeZone = Joi.string().custom((value, helpers) => {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return value;
    } catch {
        return helpers.error('any.invalid');
    }
}, 'time zone');

// currency code: 3 capital letters (IQD, USD, EUR ...), the same list the screen offers
const currencyCode = Joi.string().pattern(/^[A-Z]{3}$/);

const updateTenantSchema = Joi.object({
    name: Joi.string().trim().min(1).max(100),
    logo_url: Joi.string().max(1000).allow('', null),
    timezone: timeZone,
    currency_code: currencyCode,
}).unknown(true);

// empty time zone / currency = use the clinic's
const branchSchema = Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
    location: Joi.string().max(50).allow('', null),
    timezone: timeZone.allow('', null),
    currency_code: currencyCode.allow('', null),
    status: Joi.string().valid('active', 'inactive'),
}).unknown(true);

const updateBranchSchema = branchSchema.fork(['name'], (schema) => schema.optional());

const check = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' });
    next();
};

export default {
    update: check(updateTenantSchema),
    createBranch: check(branchSchema),
    updateBranch: check(updateBranchSchema),
};
