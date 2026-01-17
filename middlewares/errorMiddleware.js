function errorMiddleware(err, req, res, next) {
    const requestId = req.requestId || 'N/A';

    // 🔴 CENTRAL LOG — runs for EVERY error
    console.error(err?.message || 'Unexpected Error', {
        request_id: requestId,
        path: req.originalUrl,
        method: req.method,
        error: err,
    });

    if (err && err.status) {
        return res.status(err.status).json({
            message: err.message || "Error",
            code: err.code || "Error",
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