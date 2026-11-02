import Joi from "joi";

// the branch workflow switches: all four are always sent together
const workflowSchema = Joi.object({
  allow_settle_unpaid: Joi.boolean().required(),
  allow_discounts: Joi.boolean().required(),
  max_discount_percent: Joi.number().integer().min(0).max(100).required(),
  block_booking_if_owes: Joi.boolean().required(),
});

function workflow(req, res, next) {
  const { error, value } = workflowSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });
  req.body = value;
  next();
}

export default { workflow };
