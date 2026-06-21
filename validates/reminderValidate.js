import Joi from 'joi';

const schemaTemplate = Joi.object({
  kur_msg: Joi.string().min(1).required(),
  arb_msg: Joi.string().min(1).required(),
  eng_msg: Joi.string().min(1).required(),
});

const schemaSent = Joi.object({
  patient_id: Joi.number().integer().required(),
  language: Joi.string().valid('ku', 'ar', 'en').required(),
  message: Joi.string().min(1).required(),
});

function updateTemplate(req, res, next) {
  const { error } = schemaTemplate.validate(req.body);
  if (error) return res.status(400).send(error.details[0].message);
  next();
}

function markSent(req, res, next) {
  const { error } = schemaSent.validate(req.body);
  if (error) return res.status(400).send(error.details[0].message);
  next();
}

export default { updateTemplate, markSent };
