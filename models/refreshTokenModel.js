import pool from '../db_connection.js';

// One row per issued refresh token. We only ever store the SHA-256 HASH of the
// token, never the raw value, so a DB leak can't reuse it.
async function insert(user_id, token_hash, expires_at, client = pool) {
    const query = `
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        RETURNING id
    `;
    const { rows } = await client.query(query, [user_id, token_hash, expires_at]);
    return rows[0];
}

async function findByHash(token_hash, client = pool) {
    const query = `SELECT * FROM refresh_tokens WHERE token_hash = $1`;
    const { rows } = await client.query(query, [token_hash]);
    return rows[0] || null;
}

// Kill-switch: cancel one token (logout / stolen / fired).
async function revokeByHash(token_hash, client = pool) {
    const query = `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`;
    await client.query(query, [token_hash]);
}

// Cancel ALL of a user's sessions at once (e.g. "log out everywhere").
async function revokeAllForUser(user_id, client = pool) {
    const query = `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`;
    await client.query(query, [user_id]);
}

export default { insert, findByHash, revokeByHash, revokeAllForUser };
