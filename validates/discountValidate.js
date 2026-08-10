import Joi from "joi";

// percent: 0–100 ; fixed: any non-negative amount
const base = {
  name: Joi.string().trim().min(1).max(60).required(),
  type: Joi.string().valid('percent', 'fixed').required(),
  value: Joi.number().min(0).required().when('type', {
    is: 'percent',
    then: Joi.number().max(100),
  }),
};

const createSchema = Joi.object(base);
const updateSchema = Joi.object({
  name: base.name.optional(),
  type: base.type.optional(),
  value: Joi.number().min(0).optional().when('type', { is: 'percent', then: Joi.number().max(100) }),
});

function create(req, res, next) {
  const { error, value } = createSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });
  req.body = value;
  next();
}

function update(req, res, next) {
  const { error, value } = updateSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });
  req.body = value;
  next();
}

export default { create, update };
