import jwt from 'jsonwebtoken';
import authService from '../services/authService.js';

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
        req.user = {
            ...decoded,
            role: live.role ?? decoded.role,
            permissions: live.permissions,
        };
        next();
    } catch (err) {
        next(err); // DB/lookup error → handled by errorMiddleware (500), not a fake 401
    }
}

export default authMiddleware;