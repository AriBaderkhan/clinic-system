import Joi from 'joi';

// Runs AFTER the upload middleware, so text fields are strings on req.body.
const updateSchema = Joi.object({
    full_name: Joi.string().min(2).max(255).required(),
    phone: Joi.string().allow('', null).max(50),
    address: Joi.string().allow('', null),
});
function update(req, res, next) {
    const { error, value } = updateSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

const passwordSchema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).max(100).required(),
});
function password(req, res, next) {
    const { error, value } = passwordSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

const emailSendSchema = Joi.object({ email: Joi.string().email().required() });
function emailSend(req, res, next) {
    const { error, value } = emailSendSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

const emailChangeSchema = Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string().pattern(/^\d{6}$/).required().messages({ 'string.pattern.base': 'Code must be 6 digits' }),
});
function emailChange(req, res, next) {
    const { error, value } = emailChangeSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    req.body = value;
    next();
}

// the user's design: every option is sent together (same lists as the frontend's src/theme/designs.js)
const designSchema = Joi.object({
    theme: Joi.string().valid('ocean', 'graphite', 'plum', 'emerald', 'sky', 'coral', 'violet', 'custom').required(),
    // "My colours": the user's own 3 colours, only real #RRGGBB codes (kept even when another theme is picked)
    colors: Joi.object({
        brand: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).required(),
        band: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).required(),
        hi: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).required(),
    }).when('theme', { is: 'custom', then: Joi.required(), otherwise: Joi.optional() }),
    font: Joi.string().valid('jakarta', 'inter', 'manrope', 'nunito', 'poppins', 'outfit', 'rubik', 'plex', 'serif', 'lexend',
        'dmsans', 'figtree', 'sora', 'urbanist', 'montserrat', 'raleway', 'quicksand', 'mulish', 'redhat', 'merriweather').required(),
    corners: Joi.string().valid('round', 'soft', 'sharp').required(),
    cards: Joi.string().valid('soft', 'flat', 'raised').required(),
    size: Joi.string().valid('compact', 'normal', 'large').required(),
    mode: Joi.string().valid('light', 'dark').required(),
});
function design(req, res, next) {
    const { error, value } = designSchema.validate(req.body);
    if (error) return res.status(400).json({ code: 'VALIDATION_ERROR', message: error.details[0].message });
    req.body = value;
    next();
}

export default { update, password, emailSend, emailChange, design };
