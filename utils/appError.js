// src/utils/appError.js
function appError(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;       // e.g. "PATIENT_NOT_FOUND"
  err.status = status;   // e.g. 404
  err.isOperational = true;
  return err;
}

export default appError