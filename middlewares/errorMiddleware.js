import * as Sentry from '@sentry/node';

// Known, handled DB constraint errors below map to clear 4xx responses — they're
// expected app behaviour (bad input), not crashes, so we don't report them.
const HANDLED_DB_CODES = new Set(['23503', '23514', '23505', '22P02']);

function errorMiddleware(err, req, res, next) {
    const requestId = req.requestId || 'N/A';

    // 🔴 CENTRAL LOG — runs for EVERY error
    console.error(JSON.stringify({
        level: "error",
        request_id: requestId,
        message: err?.message || "Unexpected Error",
        path: req.originalUrl,
        method: req.method,
        code: err?.code,
        status: err?.status,
        stack: err?.stack,
    }));

    // 📡 Report only real crashes (500s) to Sentry. Expected, handled errors
    // (4xx with a clear message, known DB constraint violations) are normal
    // behaviour, so we skip them to keep alerts meaningful. No-op if Sentry
    // isn't initialised (dev/test without a DSN).
    const isExpected =
        (err?.status && err.status < 500) || HANDLED_DB_CODES.has(err?.code);
    if (!isExpected) {
        Sentry.captureException(err, {
            user: req.user
                ? { id: req.user.id, tenant_id: req.user.tenant_id, role: req.user.role }
                : undefined,
            tags: { request_id: requestId, route: req.originalUrl, method: req.method },
            extra: { code: err?.code, status: err?.status },
        });
    }

    if (err && err.status) {
        return res.status(err.status).json({
            message: err.message || "Error",
            code: err.code || "Error",
            meta: err.meta,            // variable values for translated messages (if any)
            support_code: requestId
        })
    }


    if (err && err.code) {
        // foreign key violation (invalid patient_id/doctor_id/etc.)
        if (err.code === "23503") {
            return res.status(400).json({
                message: "Invalid reference id.",
                code: "FK_VIOLATION",
                support_code: requestId
            });
        }

        // check constraint violation
        if (err.code === "23514") {
            return res.status(400).json({
                message: "Invalid data (check constraint).",
                code: "CHECK_VIOLATION",
                support_code: requestId
            });
        }

        // unique constraint violation (duplicate)
        if (err.code === "23505") {
            return res.status(409).json({
                message: "Duplicate value.",
                code: "UNIQUE_VIOLATION",
                support_code: requestId
            });
        }

        // invalid text representation (bad uuid/int parsing)
        if (err.code === "22P02") {
            return res.status(400).json({
                message: "Invalid input format.",
                code: "INVALID_FORMAT",
                support_code: requestId
            });
        }
    }


    return res.status(500).json({
        message: "Internal Server Error",
        code: "INTERNAL_ERROR",
        support_code: requestId
    });
}


export default errorMiddleware