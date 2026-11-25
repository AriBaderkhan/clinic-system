// PART 2 — Login, accounts, tokens, password / email change, public pages.
// REPORT MODE: tests are written with the CORRECT expected behaviour. A failing test = a finding to report.
// No real e-mail is sent (the sender is replaced); codes are read from the test database.
// Uses its own temporary users and puts back everything it changes.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import app from '../main.js';
import emailService from '../services/emailService.js';
import setupSocket from '../socket.js';
import { one, all, query, loadClinic } from './helpers/testApp.js';

vi.mock('../services/emailService.js', () => ({
    default: { sendMail: vi.fn(async () => ({})), sendVerificationCode: vi.fn(async () => ({})), sendRegistrationApproved: vi.fn(async () => ({})) },
}));

const PASSWORD = 'Test12345!';
const STAMP = Date.now();
const tempEmail = (name) => `auth-${name}-${STAMP}@smile.example.com`;
let smile, care, S1, S2, C1;
const tempUsers = [];
let ipCounter = 0;

// every call comes from a new address unless told otherwise, so the login limiter only counts where we want it
const api = (method, path, { token, body, ip } = {}) => {
    let req = request(app)[method.toLowerCase()](path).set('X-Forwarded-For', ip || `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`);
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body);
};
const login = (email, password = PASSWORD, extra = {}) => api('POST', '/login', { body: { email, password, ...extra } });
// the last code "mailed" to this address (the database only keeps a hash)
const latestCode = async (email, purpose) => emailService.sendVerificationCode.mock.calls.filter(([to, , p]) => to === email && p === purpose).at(-1)?.[1];

async function makeUser(name, branch, role_id = 4) {
    const email = tempEmail(name);
    const r = await api('POST', '/api/users', { token: await tokenOf(smile.manager), body: { branch_id: branch.id, email, password: PASSWORD, confirmPassword: PASSWORD, role_id, full_name: `Auth ${name}` } });
    if (r.status !== 201 && r.status !== 200) throw new Error(`setup user ${name}: ${r.status} ${JSON.stringify(r.body)}`);
    const id = Number((await one(`SELECT id FROM users WHERE email = $1`, [email])).id);
    tempUsers.push(id);
    return { id, email };
}
const tokenOf = async (u) => jwt.sign({ id: u.id, tenant_id: u.tenant_id, branch_id: u.branch_id }, process.env.JWT_SECRET, { expiresIn: '30m' });

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    care = await loadClinic('care.example.com');
    [S1, S2] = smile.branches;
    [C1] = care.branches;
});

afterAll(async () => {
    await query(`UPDATE tenants SET status = 'active' WHERE id = $1`, [smile.tenant_id]);
    await query(`UPDATE branches SET status = 'active' WHERE id = ANY($1)`, [[S1.id, S2.id]]);
    if (tempUsers.length) {
        await query(`DELETE FROM refresh_tokens WHERE user_id = ANY($1)`, [tempUsers]);
        for (const t of ['user_branch_roles', 'staff_floors', 'user_design', 'notifications', 'announcement_reads', 'audit_logs']) {
            await query(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [tempUsers]).catch(() => {});
        }
        await query(`DELETE FROM doctors WHERE id = ANY($1)`, [tempUsers]);
        await query(`DELETE FROM profiles WHERE user_id = ANY($1)`, [tempUsers]);
        await query(`DELETE FROM users WHERE id = ANY($1)`, [tempUsers]);
    }
    await query(`DELETE FROM email_verifications WHERE email LIKE $1`, [`%-${STAMP}@%`]);
    await query(`DELETE FROM tenant_registration_requests WHERE email LIKE $1`, [`%-${STAMP}@%`]);
});

describe('login', () => {
    it('a real user logs in: access + refresh token, no password hash anywhere in the answer', async () => {
        const r = await login(S1.reception.email);
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ ok: true, token: expect.any(String), refreshToken: expect.any(String) });
        expect(Number(r.body.user.id)).toBe(S1.reception.id);
        expect(Number(r.body.user.branch_id)).toBe(S1.id);
        expect(JSON.stringify(r.body)).not.toMatch(/\$2[aby]\$/);
    });

    it('e-mail is matched without caring about capitals', async () => {
        expect((await login(S1.reception.email.toUpperCase())).status).toBe(200);
    });

    it('an e-mail with a space before/after (phones often add one) still logs in', async () => {
        expect((await login(`${S1.reception.email} `)).status).toBe(200);
    });

    it('wrong password and unknown e-mail give exactly the same answer (nobody can test which e-mails exist)', async () => {
        const a = await login(S1.reception.email, 'wrong-password');
        const b = await login(`nobody-${STAMP}@nowhere.example.com`, 'wrong-password');
        expect(a.status).toBe(401);
        expect(b.status).toBe(401);
        const strip = ({ support_code, ...rest }) => rest;
        expect(strip(a.body)).toEqual(strip(b.body));
    });

    it('bad input is refused with 400', async () => {
        expect((await api('POST', '/login', { body: {} })).status).toBe(400);
        expect((await api('POST', '/login', { body: { email: 'not-an-email', password: 'xxxxxx' } })).status).toBe(400);
    });

    it('bad login input answers in the standard error shape (code VALIDATION_ERROR)', async () => {
        expect((await api('POST', '/login', { body: {} })).body.code).toBe('VALIDATION_ERROR');
    });

    it('a deactivated user cannot log in (and a wrong password still says only "wrong")', async () => {
        const u = await makeUser('inactive', S1);
        await query(`UPDATE users SET is_active = false WHERE id = $1`, [u.id]);
        const right = await login(u.email);
        expect(right.status).toBe(403);
        expect(right.body.code).toBe('USER_NOT_ACTIVE');
        expect((await login(u.email, 'wrong-password')).status).toBe(401);
    });

    it('a suspended clinic cannot log in', async () => {
        await query(`UPDATE tenants SET status = 'suspended' WHERE id = $1`, [smile.tenant_id]);
        try {
            const r = await login(S1.reception.email);
            expect(r.status).toBe(403);
            expect(r.body.code).toBe('TENANT_NOT_ACTIVE');
        } finally {
            await query(`UPDATE tenants SET status = 'active' WHERE id = $1`, [smile.tenant_id]);
        }
    });

    it('a closed branch cannot log in', async () => {
        await query(`UPDATE branches SET status = 'inactive' WHERE id = $1`, [S1.id]);
        try {
            const r = await login(S1.reception.email);
            expect(r.status).toBe(403);
            expect(r.body.code).toBe('BRANCH_NOT_ACTIVE');
        } finally {
            await query(`UPDATE branches SET status = 'active' WHERE id = $1`, [S1.id]);
        }
    });

    it('a user of two branches must pick one, and can only pick his own', async () => {
        const u = await makeUser('twobranch', S1);
        await query(`INSERT INTO user_branch_roles (user_id, tenant_id, branch_id, role_id) VALUES ($1, $2, $3, 4)`, [u.id, smile.tenant_id, S2.id]);
        const pick = await login(u.email);
        expect(pick.body.requiresBranchSelection).toBe(true);
        expect(pick.body.data.map((b) => Number(b.branch_id)).sort()).toEqual([S1.id, S2.id].sort());
        expect((await login(u.email, PASSWORD, { branch_id: C1.id })).status).toBe(403);
        const inS2 = await login(u.email, PASSWORD, { branch_id: S2.id });
        expect(inS2.status).toBe(200);
        expect(Number(inS2.body.user.branch_id)).toBe(S2.id);
    });
});

describe('tokens', () => {
    it('the refresh token gives a new working access token; the access token is not a refresh token and the other way round', async () => {
        const { body } = await login(S1.reception.email);
        const r = await api('POST', '/refresh', { body: { refreshToken: body.refreshToken } });
        expect(r.status).toBe(200);
        expect((await api('GET', '/me', { token: r.body.token })).status).toBe(200);
        expect((await api('POST', '/refresh', { body: { refreshToken: body.token } })).status).toBe(401);
        expect((await api('GET', '/me', { token: body.refreshToken })).status).toBe(401);
    });

    it('logout kills the refresh token', async () => {
        const { body } = await login(S1.reception.email);
        expect((await api('POST', '/logout', { body: { refreshToken: body.refreshToken } })).status).toBeLessThan(300);
        expect((await api('POST', '/refresh', { body: { refreshToken: body.refreshToken } })).status).toBe(401);
    });

    it('only the hash of a refresh token is stored, never the token itself', async () => {
        const { body } = await login(S1.reception.email);
        const raw = body.refreshToken;
        const rows = await all(`SELECT token_hash FROM refresh_tokens WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [S1.reception.id]);
        expect(rows[0].token_hash).not.toBe(raw);
        expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('a forged, expired or garbage token is refused', async () => {
        const forged = jwt.sign({ id: S1.manager.id, tenant_id: smile.tenant_id, branch_id: S1.id }, 'not-the-real-secret');
        const expired = jwt.sign({ id: S1.manager.id, tenant_id: smile.tenant_id, branch_id: S1.id }, process.env.JWT_SECRET, { expiresIn: -10 });
        for (const t of [forged, expired, 'garbage']) expect((await api('GET', '/me', { token: t })).status).toBe(401);
        expect((await api('GET', '/me')).status).toBe(401);
    });

    it('a refused token answers in the standard error shape { message, code }', async () => {
        const r = await api('GET', '/me', { token: 'garbage' });
        expect(r.body).toMatchObject({ message: expect.any(String), code: expect.any(String) });
    });

    it('a deleted (deactivated) user is locked out at once: access token and refresh both refused', async () => {
        const u = await makeUser('locked', S1);
        const { body } = await login(u.email);
        await query(`UPDATE users SET is_active = false WHERE id = $1`, [u.id]);
        expect((await api('GET', '/me', { token: body.token })).status).toBe(401);
        expect((await api('POST', '/refresh', { body: { refreshToken: body.refreshToken } })).status).toBe(401);
    });

    it('the access token is short-lived (an hour or less)', async () => {
        const { body } = await login(S1.reception.email);
        const { iat, exp } = jwt.decode(body.token);
        expect(exp - iat).toBeLessThanOrEqual(3600);
    });

    it('a deactivated PLATFORM ADMIN is locked out too', async () => {
        const email = tempEmail('platform');
        const row = await one(`INSERT INTO users (email, password, tenant_id, is_active) VALUES ($1, $2, NULL, true) RETURNING id`, [email, await bcrypt.hash(PASSWORD, 10)]);
        tempUsers.push(Number(row.id));
        await query(`INSERT INTO profiles (user_id, full_name) VALUES ($1, 'Auth Platform')`, [row.id]);
        const { body } = await login(email);
        expect((await api('GET', '/api/admin-platform/tenants', { token: body.token })).status).toBe(200);
        await query(`UPDATE users SET is_active = false WHERE id = $1`, [row.id]);
        expect((await api('GET', '/api/admin-platform/tenants', { token: body.token })).status).toBe(401);
        expect((await api('POST', '/refresh', { body: { refreshToken: body.refreshToken } })).status).toBe(401);
    });
});

describe('changing your own password and e-mail', () => {
    it('needs the current password; the new one needs at least 6 characters; then the new one works', async () => {
        const u = await makeUser('pwchange', S1);
        const { body } = await login(u.email);
        const change = (b) => api('PUT', '/api/profile/me/password', { token: body.token, body: b });
        expect((await change({ currentPassword: 'wrong-one', newPassword: 'NewPass123' })).body.code).toBe('WRONG_PASSWORD');
        expect((await change({ currentPassword: PASSWORD, newPassword: '12345' })).status).toBe(400);
        expect((await change({ currentPassword: PASSWORD, newPassword: 'NewPass123' })).status).toBe(200);
        expect((await login(u.email)).status).toBe(401);
        expect((await login(u.email, 'NewPass123')).status).toBe(200);
    });

    it('after changing the password, the OTHER logged-in sessions are logged out', async () => {
        const u = await makeUser('pwsessions', S1);
        const other = (await login(u.email)).body; // e.g. a stolen session on another device
        const mine = (await login(u.email)).body;
        expect((await api('PUT', '/api/profile/me/password', { token: mine.token, body: { currentPassword: PASSWORD, newPassword: 'NewPass123' } })).status).toBe(200);
        expect((await api('POST', '/refresh', { body: { refreshToken: other.refreshToken } })).status).toBe(401);
    });

    it('changing e-mail: a taken e-mail is refused; the code proves the new address; then you log in with it', async () => {
        const u = await makeUser('emailchange', S1);
        const { body } = await login(u.email);
        expect((await api('POST', '/api/profile/me/email/send-code', { token: body.token, body: { email: S1.manager.email } })).status).toBe(409);
        const newEmail = tempEmail('newaddress');
        expect((await api('POST', '/api/profile/me/email/send-code', { token: body.token, body: { email: newEmail } })).status).toBe(200);
        expect((await api('PUT', '/api/profile/me/email', { token: body.token, body: { email: newEmail, code: '000000' } })).status).toBe(400);
        const code = await latestCode(newEmail, 'change_email');
        expect((await api('PUT', '/api/profile/me/email', { token: body.token, body: { email: newEmail, code } })).status).toBe(200);
        expect((await login(newEmail)).status).toBe(200);
    });

    it('a manager cannot give staff a password shorter than 6 characters (same rule as everywhere else)', async () => {
        const r = await api('POST', '/api/users', { token: await tokenOf(smile.manager), body: { branch_id: S1.id, email: tempEmail('short'), password: 'abc', confirmPassword: 'abc', role_id: 4, full_name: 'Auth short' } });
        const made = await one(`SELECT id FROM users WHERE email = $1`, [tempEmail('short')]);
        if (made) tempUsers.push(Number(made.id));
        expect(r.status).toBe(400);
    });
});

describe('forgot / reset password', () => {
    it('answers the same for a known and an unknown e-mail, and only sends a code to the real account', async () => {
        const u = await makeUser('forgot', S1);
        const ghost = tempEmail('ghost');
        const a = await api('POST', '/forgot-password', { body: { email: u.email } });
        const b = await api('POST', '/forgot-password', { body: { email: ghost } });
        expect(a.status).toBe(b.status);
        expect(a.body).toEqual(b.body);
        expect(await latestCode(u.email, 'reset_password')).toMatch(/^\d{6}$/);
        expect(await latestCode(ghost, 'reset_password')).toBeUndefined();
    });

    it('a wrong code is refused; the right code sets the new password once; the code cannot be used again', async () => {
        const u = await makeUser('reset', S1);
        await api('POST', '/forgot-password', { body: { email: u.email } });
        const code = await latestCode(u.email, 'reset_password');
        const reset = (c, pw = 'Reset12345') => api('POST', '/reset-password', { body: { email: u.email, code: c, newPassword: pw } });
        expect((await reset(code === '000000' ? '111111' : '000000')).status).toBe(400);
        expect((await reset(code)).status).toBe(200);
        expect((await login(u.email, 'Reset12345')).status).toBe(200);
        expect((await reset(code, 'Another12345')).status).toBe(400);
    });

    it('after a password reset, every old session is logged out', async () => {
        const u = await makeUser('resetsessions', S1);
        const old = (await login(u.email)).body;
        await api('POST', '/forgot-password', { body: { email: u.email } });
        await api('POST', '/reset-password', { body: { email: u.email, code: await latestCode(u.email, 'reset_password'), newPassword: 'Reset12345' } });
        expect((await api('POST', '/refresh', { body: { refreshToken: old.refreshToken } })).status).toBe(401);
    });

    it('a reset code stops working after 5 wrong guesses (a 6-digit code must not be guessable)', async () => {
        const u = await makeUser('guess', S1);
        await api('POST', '/forgot-password', { body: { email: u.email } });
        const code = await latestCode(u.email, 'reset_password');
        const wrong = code === '123456' ? '654321' : '123456';
        for (let i = 0; i < 6; i++) await api('POST', '/reset-password', { body: { email: u.email, code: wrong, newPassword: 'Guess12345' } });
        expect((await api('POST', '/reset-password', { body: { email: u.email, code, newPassword: 'Guess12345' } })).status).toBe(400);
    });
});

describe('public pages (no login)', () => {
    it('the public plan list works without login and shows no internal data', async () => {
        const r = await api('GET', '/api/plans/public');
        expect(r.status).toBe(200);
        expect(JSON.stringify(r.body)).not.toMatch(/password|tenant_id|locked_price/);
    });

    it('the QR feedback form only exists for a branch of THAT clinic', async () => {
        expect((await api('GET', `/api/public/feedback/qr/${smile.tenant_id}/${S1.id}`)).status).toBe(200);
        expect((await api('GET', `/api/public/feedback/qr/${smile.tenant_id}/${C1.id}`)).status).toBe(404);
        expect((await api('GET', `/api/public/feedback/qr/999999/999999`)).status).toBe(404);
    });

    it('a feedback link that does not exist is refused', async () => {
        expect((await api('GET', '/api/public/feedback/00000000-0000-0000-0000-000000000000')).status).toBe(404);
    });

    it('one person cannot flood a clinic with QR ratings (limit per device)', async () => {
        const rating = { form_language: 'en', doctor_rating: 1, staff_rating: 1, cleanliness_rating: 1, cost_rating: 1 };
        const before = Number((await one(`SELECT count(*) AS n FROM feedbacks WHERE branch_id = $1`, [S1.id])).n);
        let accepted = 0;
        for (let i = 0; i < 40; i++) {
            const r = await api('POST', `/api/public/feedback/qr/${smile.tenant_id}/${S1.id}`, { body: rating, ip: '10.99.99.99' });
            if (r.status < 300) accepted++;
        }
        await query(`DELETE FROM feedbacks WHERE id IN (SELECT id FROM feedbacks WHERE branch_id = $1 ORDER BY id DESC LIMIT $2)`, [S1.id, Number((await one(`SELECT count(*) AS n FROM feedbacks WHERE branch_id = $1`, [S1.id])).n) - before]);
        expect(accepted).toBe(5);
    });

    it('sign-up: a code cannot be asked again within 60 seconds; a wrong code is refused; no request without the payment image', async () => {
        const email = tempEmail('signup');
        expect((await api('POST', '/api/register/send-code', { body: { email } })).status).toBe(200);
        expect((await api('POST', '/api/register/send-code', { body: { email } })).status).toBe(429);
        const code = await latestCode(email, 'register');
        expect((await api('POST', '/api/register/verify-code', { body: { email, code: code === '000000' ? '111111' : '000000' } })).status).toBe(400);
        expect((await api('POST', '/api/register/verify-code', { body: { email, code } })).status).toBe(200);
        const plan = await one(`SELECT id FROM plans ORDER BY id LIMIT 1`);
        const r = await api('POST', '/api/register', { body: { tenant_name: 'Auth Clinic', manager_name: 'Auth', email, phone: '07501112233', password: PASSWORD, confirmPassword: PASSWORD, plan_id: plan.id, billing_period: 'monthly' } });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('EVIDENCE_REQUIRED');
    });
});

describe('app-wide safety', () => {
    it('security headers are on, and a strange website is not allowed to call the API', async () => {
        const r = await api('GET', '/api/plans/public').set('Origin', 'https://evil.example');
        expect(r.headers['x-content-type-options']).toBe('nosniff');
        expect(r.headers['x-powered-by']).toBeUndefined();
        expect(r.headers['access-control-allow-origin']).not.toBe('https://evil.example');
    });

    it('one office (same internet address) can log in more than 10 times in 15 minutes when the logins are CORRECT', async () => {
        const office = '10.88.88.88';
        let blocked = 0;
        for (let i = 0; i < 12; i++) {
            const r = await api('POST', '/login', { body: { email: S1.reception.email, password: PASSWORD }, ip: office });
            if (r.status === 429) blocked++;
        }
        expect(blocked).toBe(0);
    });

    it('wrong passwords from one address ARE stopped after 10 tries', async () => {
        const attacker = '10.77.77.77';
        const codes = [];
        for (let i = 0; i < 12; i++) codes.push((await api('POST', '/login', { body: { email: S1.reception.email, password: 'wrong-password' }, ip: attacker })).status);
        expect(codes.slice(10)).toEqual([429, 429]);
    });
});

describe('extra checks for the Part 2 fixes', () => {
    it('a code is stored as a hash, never as the 6 digits', async () => {
        const u = await makeUser('hashcode', S1);
        await api('POST', '/forgot-password', { body: { email: u.email } });
        const plain = await latestCode(u.email, 'reset_password');
        const stored = (await one(`SELECT code FROM email_verifications WHERE email = $1 ORDER BY created_at DESC LIMIT 1`, [u.email])).code;
        expect(stored).not.toBe(plain);
        expect(stored).toMatch(/^[0-9a-f]{64}$/);
    });

    it('asking for a new code cancels the old one', async () => {
        const u = await makeUser('newcode', S1);
        await api('POST', '/forgot-password', { body: { email: u.email } });
        const first = await latestCode(u.email, 'reset_password');
        await query(`UPDATE email_verifications SET created_at = NOW() - INTERVAL '2 minutes' WHERE email = $1`, [u.email]); // past the 60 s wait
        await api('POST', '/forgot-password', { body: { email: u.email } });
        const second = await latestCode(u.email, 'reset_password');
        if (first === second) return; // 1-in-a-million: both codes the same
        expect((await api('POST', '/reset-password', { body: { email: u.email, code: first, newPassword: 'Reset12345' } })).status).toBe(400);
        expect((await api('POST', '/reset-password', { body: { email: u.email, code: second, newPassword: 'Reset12345' } })).status).toBe(200);
    });

    it('after 5 tries the code answers CODE_LOCKED (translated on screen)', async () => {
        const u = await makeUser('locked-code', S1);
        await api('POST', '/forgot-password', { body: { email: u.email } });
        const code = await latestCode(u.email, 'reset_password');
        const wrong = code === '123456' ? '654321' : '123456';
        for (let i = 0; i < 5; i++) await api('POST', '/reset-password', { body: { email: u.email, code: wrong, newPassword: 'Guess12345' } });
        const r = await api('POST', '/reset-password', { body: { email: u.email, code, newPassword: 'Guess12345' } });
        expect(r.body.code).toBe('CODE_LOCKED');
    });

    it('editing a staff member: a short or empty new password is refused, other edits still work', async () => {
        const u = await makeUser('editpw', S1);
        const boss = await tokenOf(smile.manager);
        expect((await api('PUT', `/api/users/${u.id}`, { token: boss, body: { password: 'abc' } })).status).toBe(400);
        expect((await api('PUT', `/api/users/${u.id}`, { token: boss, body: { password: '' } })).status).toBe(400);
        expect((await api('PUT', `/api/users/${u.id}`, { token: boss, body: { full_name: 'Auth renamed', phone: '07500000099' } })).status).toBe(200);
        expect((await api('PUT', `/api/users/${u.id}`, { token: boss, body: { password: 'Longer123' } })).status).toBe(200);
        expect((await login(u.email, 'Longer123')).status).toBe(200);
    });

    it('used-up refresh tokens are cleaned away at the next login', async () => {
        const u = await makeUser('cleanup', S1);
        const first = (await login(u.email)).body;
        await api('POST', '/logout', { body: { refreshToken: first.refreshToken } });
        expect(Number((await one(`SELECT count(*) AS n FROM refresh_tokens WHERE user_id = $1 AND revoked`, [u.id])).n)).toBe(1);
        await login(u.email);
        expect(Number((await one(`SELECT count(*) AS n FROM refresh_tokens WHERE user_id = $1 AND revoked`, [u.id])).n)).toBe(0);
        expect(Number((await one(`SELECT count(*) AS n FROM refresh_tokens WHERE user_id = $1`, [u.id])).n)).toBe(1);
    });

    it('the live-notification connection refuses the refresh token and accepts the normal one', async () => {
        let onConnect;
        setupSocket({ on: (event, fn) => { onConnect = fn; } });
        const fakeSocket = (token) => ({ handshake: { auth: { token } }, disconnect: vi.fn(), join: vi.fn() });
        const { body } = await login(S1.reception.email);
        const withRefresh = fakeSocket(body.refreshToken);
        onConnect(withRefresh);
        expect(withRefresh.disconnect).toHaveBeenCalled();
        expect(withRefresh.join).not.toHaveBeenCalled();
        const withAccess = fakeSocket(body.token);
        onConnect(withAccess);
        expect(withAccess.join).toHaveBeenCalledWith(`user_${S1.reception.id}`);
    });

    it('a blocked login answers in the standard shape with code RATE_LIMITED', async () => {
        const ip = '10.66.66.66';
        let last;
        for (let i = 0; i < 11; i++) last = await api('POST', '/login', { body: { email: S1.reception.email, password: 'wrong-password' }, ip });
        expect(last.status).toBe(429);
        expect(last.body.code).toBe('RATE_LIMITED');
    });
});
