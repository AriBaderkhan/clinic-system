import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

// Every limit answers in the standard error shape, so the screens can translate it by code.
const limited = { message: 'Too many attempts, please try again later.', code: 'RATE_LIMITED' };
const FIFTEEN_MIN = 15 * 60 * 1000;

// Login: only WRONG passwords count, per e-mail + internet address.
// A clinic shares one internet address, so correct logins must never lock the office out.
export const loginLimiter = rateLimit({
    windowMs: FIFTEEN_MIN,
    limit: 10,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email || '').trim().toLowerCase()}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: limited,
});

// Forgot / reset password: every request counts (each one sends a mail or tries a code).
export const codeLimiter = rateLimit({
    windowMs: FIFTEEN_MIN,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: limited,
});

// Public sign-up pages.
export const publicLimiter = rateLimit({
    windowMs: FIFTEEN_MIN,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: limited,
});

// Public feedback forms (QR + link): a few ratings per device, so nobody can flood a branch.
export const feedbackLimiter = rateLimit({
    windowMs: FIFTEEN_MIN,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: limited,
});
