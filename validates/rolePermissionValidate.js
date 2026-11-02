import Joi from "joi";

// the FULL list of ticks the role should have in this branch,
// + optional own/all for the view ticks, e.g. { view_patient: 'own' }
const updateSchema = Joi.object({
    permissions: Joi.array()
        .items(Joi.string().trim().pattern(/^[a-z_]+$/).max(64))
        .unique()
        .max(200)
        .required(),
    scopes: Joi.object()
        .pattern(Joi.string().pattern(/^[a-z_]+$/).max(64), Joi.string().valid('own', 'all'))
        .max(20)
        .default({}),
}).unknown(false);

// a role name: letters, numbers, spaces and - _ . ( ) in any language
const roleName = Joi.string().trim().min(2).max(40).pattern(/^[\p{L}\p{N} ._()\-]+$/u);

const createSchema = Joi.object({
    name: roleName.required(),
    base_role_id: Joi.number().integer().positive().required(),
    is_doctor: Joi.boolean().default(false),
}).unknown(false);

const renameSchema = Joi.object({ name: roleName.required() }).unknown(false);

const send400 = (res, error) => res.status(400).json({ message: error.details[0].message, code: 'VALIDATION_ERROR' });

function update(req, res, next) {
    const { error, value } = updateSchema.validate(req.body);
    if (error) return send400(res, error);
    req.body = value;
    next();
}

function create(req, res, next) {
    const { error, value } = createSchema.validate(req.body);
    if (error) return send400(res, error);
    req.body = value;
    next();
}

function rename(req, res, next) {
    const { error, value } = renameSchema.validate(req.body);
    if (error) return send400(res, error);
    req.body = value;
    next();
}

export default { update, create, rename }
