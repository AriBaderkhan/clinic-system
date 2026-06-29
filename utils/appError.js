// src/utils/appError.js
// `meta` carries any variable values for the message (e.g. { feature: "..." }),
// so the frontend can translate the sentence and slot the value into {{...}}.
function appError(code, message, status = 400, meta) {
  const err = new Error(message);
  err.code = code;       // e.g. "PATIENT_NOT_FOUND"
  err.status = status;   // e.g. 404
  err.meta = meta;       // optional: { feature: "insights_assistant" }
  err.isOperational = true;
  return err;
}

export default appError