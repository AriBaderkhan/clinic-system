import auditService from '../services/auditService.js';

// Records successful state-changing actions (POST/PUT/PATCH/DELETE) once the
// response is sent. Registered globally, but reads req.user at FINISH time —
// after each route's authMiddleware has populated it. Fire-and-forget: it must
// never block or break a real request.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const auditMiddleware = (req, res, next) => {
    res.on('finish', () => {
        if (!MUTATING.has(req.method)) return;       // only changes, not reads
        if (res.statusCode >= 400) return;           // only actions that succeeded
        if (!req.user?.tenant_id) return;            // only authenticated tenant users

        auditService.record({
            tenant_id: req.user.tenant_id,
            branch_id: req.user.branch_id ?? null,
            actor_id: req.user.id ?? null,
            actor_name: req.user.name ?? null,
            actor_role: req.user.role ?? null,
            method: req.method,
            path: req.originalUrl,
            status_code: res.statusCode,
            request_id: req.requestId ?? null,
            ip: req.ip ?? null,
        });
    });
    next();
};

export default auditMiddleware;
