import Joi from 'joi'
import { MAX_MONEY } from '../utils/money.js';

const createExpensesSchema = Joi.object({
  type: Joi.string().required(),
  // an expense is money going out: more than 0, at most what the money columns hold
  amount: Joi.number().positive().max(MAX_MONEY).required(),
  expense_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  note: Joi.string().allow('').optional()
})

function create(req, res, next) {
  const { error } = createExpensesSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
  next();
}

const updateExpensesSchema = createExpensesSchema.fork([
  'type', 'amount', 'expense_date', 'note'
], (schema) => schema.optional())

function update(req, res, next) {
  const { error } = updateExpensesSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' })
  next();
}

export default {
  create,
  update
}
