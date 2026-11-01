import Joi from 'joi';
import { MAX_MONEY } from '../utils/money.js';


const schemaEditSession = Joi.object({
    next_plan: Joi.string().min(3).max(300).allow('', null).optional(), // optional
    notes: Joi.string().max(1000).allow('', null).optional(),           // optional
    // the full new list of normal works (may be empty = remove them all) + new plan works
    works: Joi.array()
        .items(
            Joi.object({
                work_id: Joi.number().integer().positive().required(),
                quantity: Joi.number().integer().positive().min(1).max(1000).required(),
                tooth_number: Joi.number().integer().min(11).max(85).allow(null),
                // price charged per unit (>= catalog minimum, checked in the service)
                unit_price: Joi.number().min(0).max(MAX_MONEY).allow(null).optional(),
                // for adding treatment-plan works during an edit:
                treatment_plan_id: Joi.number().integer().positive().allow(null).optional(),
                agreed_total: Joi.number().positive().max(MAX_MONEY).allow(null).optional(),
                // whole-mouth region: 'upper' | 'lower' (absent/null = whole mouth)
                arch: Joi.string().valid('upper', 'lower').allow(null).optional(),
            })
        )
        .optional(),
    // treatment plans the doctor ticked "Done" for (mark completed)
    completedPlanIds: Joi.array().items(Joi.number().integer().positive()).optional(),
    // optional prescription edited alongside the works
    prescription: Joi.array().items(
        Joi.object({
            drug_name: Joi.string().trim().min(1).required(),
            dosage: Joi.string().trim().allow('', null).optional(),
            frequency: Joi.string().trim().allow('', null).optional(),
            duration: Joi.string().trim().allow('', null).optional(),
            instructions: Joi.string().trim().allow('', null).optional(),
        })
    ).optional()
});

function edit(req, res, next) {
    const { error, value } = schemaEditSession.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
    req.body = value;
    next();
}

// Edit one payment (normal or plan): the amount must stay above 0 — use delete to remove it.
const schemaPaymentEdit = Joi.object({
    amount: Joi.number().positive().max(MAX_MONEY).required(),
    note: Joi.string().max(1000).allow('', null).optional(),
});

function paymentEdit(req, res, next) {
    const { error, value } = schemaPaymentEdit.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
    req.body = value;
    next();
}

// Take a payment: normal amount and/or plan amounts, optional discount / settle.
const schemaPay = Joi.object({
    normalAmount: Joi.number().positive().max(MAX_MONEY).allow(null).optional(),
    planPayments: Joi.array().items(Joi.object({
        plan_id: Joi.number().integer().positive().required(),
        amount: Joi.number().positive().max(MAX_MONEY).required(),
    })).max(20).optional(),
    note: Joi.string().max(1000).allow('', null).optional(),
    // strict: only a real true/false — settling is permanent
    settleNormal: Joi.boolean().strict().optional(),
    discountId: Joi.number().integer().positive().allow(null).optional(),
});

function pay(req, res, next) {
    const { error, value } = schemaPay.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
    req.body = value;
    next();
}

// Move a plan work to another plan of the same patient.
const schemaMovePlanWork = Joi.object({
    treatment_plan_id: Joi.number().integer().positive().required(),
});

function movePlanWork(req, res, next) {
    const { error, value } = schemaMovePlanWork.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
    req.body = value;
    next();
}


const listSessionsFiltersSchema = Joi.object({
    day: Joi.string().valid("today", "yesterday", "last_week", "last_month").optional(),
    q: Joi.string().trim().min(1).max(100).optional(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
}).unknown(false)

function filters(req, res, next) {
    const { error } = listSessionsFiltersSchema.validate(req.query);
    if (error) return res.status(400).json({ message: error.details[0].message })
    next();
}

// "Sessions waiting for payment" list
const unpaidFiltersSchema = Joi.object({
    q: Joi.string().trim().max(100).allow('').optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    floor_id: Joi.number().integer().positive().optional(),
}).unknown(false)

function unpaidFilters(req, res, next) {
    const { error } = unpaidFiltersSchema.validate(req.query);
    if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
    next();
}

export default { edit, filters, unpaidFilters, paymentEdit, movePlanWork, pay }