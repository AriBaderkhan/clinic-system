import Joi from "joi";

const floorSchema = Joi.object({
    name: Joi.string().trim().min(1).max(60).required(),
    sort_order: Joi.number().integer().min(0).max(1000).default(0),
});

// floor_id null = no home floor (the person sees / shows on every floor)
const staffFloorSchema = Joi.object({
    floor_id: Joi.number().integer().positive().allow(null).required(),
});

const send400 = (res, error) => res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' });

function save(req, res, next) {
    const { error, value } = floorSchema.validate(req.body);
    if (error) return send400(res, error);
    req.body = value;
    next();
}

function staffFloor(req, res, next) {
    const { error, value } = staffFloorSchema.validate(req.body);
    if (error) return send400(res, error);
    req.body = value;
    next();
}

export default { save, staffFloor }
