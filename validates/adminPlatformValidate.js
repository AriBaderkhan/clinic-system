import Joi from 'joi';
import asyncWrap from '../utils/asyncWrap.js';
import appError from '../utils/appError.js';

const registerTenantSchema = Joi.object({
    tenant_name: Joi.string().min(3).required(),
    currency: Joi.string().length(3).optional(),
    timezone: Joi.string().optional(),

    manager_name: Joi.string().min(3).required(),
    manager_email: Joi.string().email().required(),
    manager_password: Joi.string().min(6).required(),

    plan_id: Joi.number().positive().required(),

    phone: Joi.string().pattern(/^[0-9]+$/).min(10).optional(),
    address: Joi.string().optional()
});

const registerTenant = asyncWrap(async (req, res, next) => {
    const { error } = registerTenantSchema.validate(req.body);
    if (error) {
        throw appError('VALIDATION_ERROR', error.details[0].message, 400);
    }
    next();
});

export default {
    registerTenant
};
