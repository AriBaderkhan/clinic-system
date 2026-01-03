import Joi from 'joi';

const idSchema = Joi.number().integer().positive().required();

function validateIdParam(paramName) {
  return (req, res, next) => {
    const { error } = idSchema.validate(req.params[paramName]);
    if (error) {
      return res.status(400).json({ message: `Invalid ${paramName}` });
    }
    next();
  };
}



export default validateIdParam ;