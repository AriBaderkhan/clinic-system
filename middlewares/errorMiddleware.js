function errorMiddleware(err, req, res, next) {
    if (err & err.status) {
        return res.status(req.status).sjon({
            message: err.message || "Error",
            code: err.code || "Error"
        })
    }


    if (err && err.code) {
        // foreign key violation (invalid patient_id/doctor_id/etc.)
        if (err.code === "23503") {
            return res.status(400).json({
                message: "Invalid reference id.",
                code: "FK_VIOLATION",
            });
        }

        // check constraint violation
        if (err.code === "23514") {
            return res.status(400).json({
                message: "Invalid data (check constraint).",
                code: "CHECK_VIOLATION",
            });
        }

        // unique constraint violation (duplicate)
        if (err.code === "23505") {
            return res.status(409).json({
                message: "Duplicate value.",
                code: "UNIQUE_VIOLATION",
            });
        }

        // invalid text representation (bad uuid/int parsing)
        if (err.code === "22P02") {
            return res.status(400).json({
                message: "Invalid input format.",
                code: "INVALID_FORMAT",
            });
        }
    }


    console.log('Unexpected Error', {
        path: req.originalUrl,
        method: req.method,
        err,
    })

    return res.status(500).json({
        message: "Internal Server Error",
        code: "INTERNAL_ERROR",
    });
}


export default errorMiddleware