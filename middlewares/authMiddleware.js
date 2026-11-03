import jwt from 'jsonwebtoken';
import authService from '../services/authService.js';

// What a clinic with an EXPIRED subscription may still reach: its own status,
// the plans, the renewal request, and its profile. Everything else is blocked.
const EXPIRED_ALLOWED = [
    'GET /me',
    'GET /api/subscriptions/me',
    'GET /api/subscriptions/me/features',
    'GET /api/subscriptions/me/quote',
    'POST /api/subscriptions/request',
    'GET /api/plans',
    'GET /api/profile/me',
    'GET /api/profile/me/design',
    'PUT /api/profile/me/design',
];

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send("Access Denied. No token provided.");
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).send("Invalid Token");
    }

    // A refresh token must never be accepted as an access token.
    if (decoded.type === 'refresh') {
        return res.status(401).send("Invalid Token");
    }

    try {
        // Identity (id/tenant/branch) comes from the verified token, but role +
        // permissions are read LIVE from the DB so changes apply instantly and a
        // stale long-lived token can't keep old permissions.
        const live = await authService.getLiveContext(decoded.id, decoded.tenant_id, decoded.branch_id);
        // deleted user: 401 so the app's refresh fails too and it logs them out
        if (live.user_active === false) {
            return res.status(401).json({ message: 'User is not active', code: 'USER_NOT_ACTIVE' });
        }
        req.user = {
            ...decoded,
            role: live.role ?? decoded.role,
            role_id: live.role_id ?? null,
            role_scope: live.role_scope ?? null,
            permissions: live.permissions,
            scopes: live.scopes || {},
            clinic_name: live.clinic_name,
            branch_checked: live.branch_checked === true,
        };

        const route = `${req.method} ${req.originalUrl.split('?')[0]}`;
        if (live.subscription_expired && !EXPIRED_ALLOWED.includes(route)) {
            return res.status(403).json({
                message: 'Your clinic subscription has expired. Please renew to continue.',
                code: 'SUBSCRIPTION_EXPIRED',
                support_code: req.requestId || 'N/A',
            });
        }
        next();
    } catch (err) {
        next(err); // DB/lookup error → handled by errorMiddleware (500), not a fake 401
    }
}

export default authMiddleware;