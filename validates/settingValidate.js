import Joi from "joi";

// the branch workflow switches: always sent together (allow_overpay: older screens that don't send it keep the default "yes")
const workflowSchema = Joi.object({
  allow_settle_unpaid: Joi.boolean().required(),
  allow_discounts: Joi.boolean().required(),
  max_discount_percent: Joi.number().integer().min(0).max(100).required(),
  block_booking_if_owes: Joi.boolean().required(),
  allow_overpay: Joi.boolean().default(true),
});

function workflow(req, res, next) {
  const { error, value } = workflowSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });
  req.body = value;
  next();
}

export default { workflow };
