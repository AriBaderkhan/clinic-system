import Joi from 'joi';
import { MAX_MONEY } from '../utils/money.js';

const editTpSchema = Joi.object({
    // accepts "RCT" or "rct" — stored lowercase, same as the work catalog codes
    type: Joi.string().lowercase().valid("ortho", "implant", "rct", "re_rct").optional(),
    agreed_total: Joi.number().min(0).max(MAX_MONEY).optional(),
    is_completed: Joi.boolean().optional(),

}).min(1);

function update(req, res, next) {
    const { error, value } = editTpSchema.validate(req.body, {
        abortEarly: true,
        convert: true,        // allow "200000" -> 200000
        stripUnknown: true,   // removes unexpected fields
    });
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
    req.body = value;
    next();
}

// "Paid for this plan in this visit" — 0 removes it.
const paidSchema = Joi.object({
    amount: Joi.number().min(0).max(MAX_MONEY).required(),
});

function paid(req, res, next) {
    const { error, value } = paidSchema.validate(req.body, { convert: true, stripUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
    req.body = value;
    next();
}

export default { update, paid }
