// validations/monthlyExpenses.validation.js
import Joi from "joi";

const money = Joi.number()
  .precision(2)
  .min(0)
  .max(9999999999.99);

 const createMonthlyExpensesSchema = Joi.object({
  // Expecting "YYYY-MM-01" (first day of month). We'll enforce day=01.
  month: Joi.date()
    .iso()
    .required()
    .custom((value, helpers) => {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return helpers.error("date.base");

      // Enforce first day of month
      if (d.getUTCDate() !== 1) {
        return helpers.message('month must be the first day of the month (e.g. "2025-01-01")');
      }
      return value;
    }),

  materials: money.default(0),
  salary: money.default(0),

  company_name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required(),

  company_total: money.default(0),

  electric: money.default(0),
  rent: money.default(0),
  tax: money.default(0),
  marketing: money.default(0),
  other: money.default(0),

  notes: Joi.string().trim().max(2000).allow("", null).default(null),

})

 function validateCreateMonthlyExpenses(req,res,next){
    const { error } =  createMonthlyExpensesSchema.validate(req.body);
    if (error) return res.status(400).json({message: error.details[0].message});
  next();

}
 

const updateMonthlyExpensesSchema = createMonthlyExpensesSchema.fork(['month', 'materials', 'salary', 'company_name', 'company_total','electric','rent','tax','marketing','other','notes'], (field) => field.optional());

function validateUpdateMonthlyExpenses(req, res, next) {
      const { error, value } = updateMonthlyExpensesSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error)  return res.status(400).json({
    message: "Validation failed",
    errors: error.details.map(d => d.message)
  });
    next();
  }
export default {validateCreateMonthlyExpenses, validateUpdateMonthlyExpenses}
