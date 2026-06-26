import crypto from 'crypto';
import emailVerificationModel from '../models/emailVerificationModel.js';
import emailService from './emailService.js';
import appError from '../utils/appError.js';

// Reusable email one-time-code flow. Every step takes a `purpose` so the same
// mechanism powers register / change_email / reset_password.
const CODE_TTL_MIN = 10;        // a fresh code lives 10 minutes
const VERIFIED_TTL_MIN = 30;    // once verified, you have 30 min to finish the flow
const RESEND_COOLDOWN_SEC = 60; // anti-spam: min seconds between code requests

function sixDigit() {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// Generate + email a code for (email, purpose).
async function requestCode(email, purpose) {
    const latest = await emailVerificationModel.getLatest(email, purpose);
    if (latest) {
        const ageSec = (Date.now() - new Date(latest.created_at).getTime()) / 1000;
        if (ageSec < RESEND_COOLDOWN_SEC) {
            throw appError('CODE_COOLDOWN', `Please wait ${Math.ceil(RESEND_COOLDOWN_SEC - ageSec)}s before requesting another code.`, 429);
        }
    }
    const code = sixDigit();
    const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);
    await emailVerificationModel.insertCode(email, code, purpose, expiresAt);
    await emailService.sendVerificationCode(email, code, purpose);
    return { sent: true };
}

// Check the typed code; on success the email stays "verified" for VERIFIED_TTL_MIN.
async function confirmCode(email, code, purpose) {
    const row = await emailVerificationModel.findActiveByCode(email, purpose, code);
    if (!row) throw appError('CODE_INVALID', 'Invalid or expired code.', 400);
    const expiresAt = new Date(Date.now() + VERIFIED_TTL_MIN * 60_000);
    await emailVerificationModel.markVerified(row.id, expiresAt);
    return { verified: true };
}

// Guard for the final step: email must be verified (not yet consumed). Returns
// the row so the caller can consume() it AFTER its own success.
async function assertVerified(email, purpose) {
    const row = await emailVerificationModel.findVerified(email, purpose);
    if (!row) throw appError('EMAIL_NOT_VERIFIED', 'Please verify your email first.', 400);
    return row;
}

async function consume(id) {
    await emailVerificationModel.consume(id);
}

export default { requestCode, confirmCode, assertVerified, consume };
