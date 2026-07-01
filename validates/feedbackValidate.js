import Joi from 'joi';

const schemaTemplate = Joi.object({
  kur_msg: Joi.string().min(1).required(),
  arb_msg: Joi.string().min(1).required(),
  eng_msg: Joi.string().min(1).required(),
});

// Create an invite (keyed per patient). appointment_id is the representative
// (latest) completed appointment; optional. source is informational.
const schemaInvite = Joi.object({
  source: Joi.string().valid('patient', 'appointment').optional(),
  patient_id: Joi.number().integer().required(),
  appointment_id: Joi.number().integer().optional().allow(null),
  language: Joi.string().valid('ku', 'ar', 'en').required(),
});

const schemaDismiss = Joi.object({
  source: Joi.string().valid('patient', 'appointment').optional(),
  patient_id: Joi.number().integer().required(),
  appointment_id: Joi.number().integer().optional().allow(null),
});

// Public submission: 4 rated categories (overall is computed on the backend as
// their average). Each rating 1..5 required; comments + general note optional.
const rating = Joi.number().integer().min(1).max(5).required();
const comment = Joi.string().allow('', null).max(1000);
const schemaSubmit = Joi.object({
  form_language: Joi.string().valid('ku', 'ar', 'en').required(),
  anonymous: Joi.boolean().default(false),
  doctor_rating: rating,      doctor_comment: comment,
  staff_rating: rating,       staff_comment: comment,
  cleanliness_rating: rating, cleanliness_comment: comment,
  cost_rating: rating,        cost_comment: comment,
  note: comment,              // general "anything else" note
});

const run = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) return res.status(400).send(error.details[0].message);
  next();
};

export default {
  updateTemplate: run(schemaTemplate),
  invite: run(schemaInvite),
  dismiss: run(schemaDismiss),
  submit: run(schemaSubmit),
};
