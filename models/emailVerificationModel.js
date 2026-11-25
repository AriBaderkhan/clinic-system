import pool from '../db_connection.js';

// Generic email one-time-code store. `purpose` keeps it reusable across flows
// (register / change_email / reset_password).

async function insertCode(email, code, purpose, expiresAt) {
    const { rows } = await pool.query(
        `INSERT INTO email_verifications (email, code, purpose, expires_at)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [email, code, purpose, expiresAt]
    );
    return rows[0];
}

// Most recent code for this email+purpose (used for the resend cooldown).
async function getLatest(email, purpose) {
    const { rows } = await pool.query(
        `SELECT * FROM email_verifications
         WHERE email = $1 AND purpose = $2
         ORDER BY created_at DESC LIMIT 1`,
        [email, purpose]
    );
    return rows[0] || null;
}

// The NEWEST still-valid code for this email+purpose (an older code stops counting once a new one is sent).
async function findLatestActive(email, purpose) {
    const { rows } = await pool.query(
        `SELECT * FROM email_verifications
         WHERE email = $1 AND purpose = $2
           AND consumed = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email, purpose]
    );
    return rows[0] || null;
}

// Count one try BEFORE comparing (so tries sent at the same moment are all counted).
// Returns null when the code already used up its tries.
async function useTry(id, maxTries) {
    const { rows } = await pool.query(
        `UPDATE email_verifications SET attempts = attempts + 1
         WHERE id = $1 AND attempts < $2 RETURNING *`,
        [id, maxTries]
    );
    return rows[0] || null;
}

// A verified-but-not-yet-used record (proof the email was confirmed).
async function findVerified(email, purpose) {
    const { rows } = await pool.query(
        `SELECT * FROM email_verifications
         WHERE email = $1 AND purpose = $2
           AND verified = TRUE AND consumed = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email, purpose]
    );
    return rows[0] || null;
}

async function markVerified(id, expiresAt) {
    const { rows } = await pool.query(
        `UPDATE email_verifications SET verified = TRUE, expires_at = $2 WHERE id = $1 RETURNING *`,
        [id, expiresAt]
    );
    return rows[0];
}

async function consume(id) {
    await pool.query(`UPDATE email_verifications SET consumed = TRUE WHERE id = $1`, [id]);
}

export default { insertCode, getLatest, findLatestActive, useTry, findVerified, markVerified, consume };
