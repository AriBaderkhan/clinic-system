import Joi from 'joi'

const createExpensesSchema = Joi.object({
  type: Joi.string().required(),
  amount: Joi.number().required(),
  expense_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  note: Joi.string().allow('').optional()
})

function createExpenses(req, res, next) {
  const { error } = createExpensesSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message })
  next();
}

const updateExpensesSchema = createExpensesSchema.fork([
  'type', 'amount', 'expense_date', 'note'
], (schema) => schema.optional())

function updateExpenses(req, res, next) {
  const { error } = updateExpensesSchema.validate(req.body);
  if (error) return res.json(400).json({ message: error.details[0].message })
  next();
}

export default {
  createExpenses,
  updateExpenses
}