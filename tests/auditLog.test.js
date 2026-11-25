// PART 11 — Activity log (who did what, when) + the token that "switch branch" gives.
// Fixed 2026-11-24: platform admin actions logged, log search checked, the owner's "open branch" gives a 1-hour token
// + a renewal token for that branch. Made-up data only; everything made is removed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../main.js';
import { call, one, all, query, loadClinic } from './helpers/testApp.js';

const MARK = 'test-auditlog';
const N = Number;
const ADMIN = { id: 8, tenant_id: null, branch_id: null };
let smile, care, S1, startedAt, saved = {};

// the log is written just after the answer is sent: wait for it
const logRow = async (where, params) => {
    for (let i = 0; i < 30; i++) {
        const r = await one(`SELECT * FROM audit_logs WHERE created_at >= $1 AND ${where} ORDER BY id DESC LIMIT 1`, [startedAt, ...params]);
        if (r) return r;
        await new Promise((res) => setTimeout(res, 50));
    }
    return null;
};
const login = async (email, branch_id) => {
    const r = await request(app).post('/login').send({ email, password: 'Test12345!', ...(branch_id ? { branch_id } : {}) });
    return r.body;
};

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    care = await loadClinic('care.example.com');
    S1 = smile.branches[0];
    startedAt = new Date();
    saved.plan = await one(`SELECT price FROM plans WHERE id = 1`);
});

afterAll(async () => {
    await query(`DELETE FROM patients WHERE name LIKE $1 AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = patients.id)`, [`${MARK}%`]);
    await query(`DELETE FROM monthly_expenses WHERE type = $1`, [MARK]);
    await query(`UPDATE plans SET price = $1 WHERE id = 1`, [saved.plan.price]);
    await query(`DELETE FROM refresh_tokens WHERE created_at >= $1 AND user_id IN (SELECT id FROM users WHERE email LIKE '%example.com')`, [startedAt]).catch(() => {});
});

describe('every change leaves a who / what / when line', () => {
    it('patient add / edit / delete, expense add / delete, clinic settings save', async () => {
        const boss = smile.managerIn(S1.id);
        const add = await call('POST', '/api/patients', S1.reception, { name: `${MARK} patient`, phone: '07501230001', age: 33 });
        expect(add.status).toBe(201);
        const pid = N(add.body.data.id);
        await call('PUT', `/api/patients/${pid}`, S1.reception, { name: `${MARK} patient 2` });
        await call('DELETE', `/api/patients/${pid}`, boss);
        const exp = await call('POST', '/api/monthly-expenses', boss, { type: MARK, amount: 5000, expense_date: '2026-11-20' });
        await call('DELETE', `/api/monthly-expenses/${exp.body.data.id}`, boss);
        await call('PUT', '/api/tenants', smile.manager, { name: (await one(`SELECT name FROM tenants WHERE id = $1`, [smile.tenant_id])).name });

        const want = [
            ['POST', '/api/patients', S1.reception, 'patients.create'],
            ['PUT', `/api/patients/${pid}`, S1.reception, 'patients.update'],
            ['DELETE', `/api/patients/${pid}`, boss, 'patients.delete'],
            ['POST', '/api/monthly-expenses', boss, 'monthly-expenses.create'],
            ['DELETE', `/api/monthly-expenses/${exp.body.data.id}`, boss, 'monthly-expenses.delete'],
            ['PUT', '/api/tenants', smile.manager, 'tenants.update'],
        ];
        for (const [m, p, u, action] of want) {
            const r = await logRow(`method = $2 AND path = $3 AND actor_id = $4`, [m, p, u.id]);
            expect([p, !!r]).toEqual([p, true]);
            expect(r).toMatchObject({ action, tenant_id: smile.tenant_id, status_code: m === 'POST' ? 201 : 200 });
            expect(r.actor_role).toBeTruthy();
        }
    });

    it('a REFUSED action (403 / 400) is not written as done', async () => {
        await call('DELETE', `/api/monthly-expenses/1`, S1.reception);                 // 403
        await call('POST', '/api/monthly-expenses', smile.managerIn(S1.id), { type: MARK }); // 400
        await new Promise((r) => setTimeout(r, 300));
        const rows = await all(`SELECT status_code FROM audit_logs WHERE created_at >= $1 AND path LIKE '/api/monthly-expenses%' AND status_code >= 400`, [startedAt]);
        expect(rows).toEqual([]);
    });

    it('with a REAL login, the person\'s name is written (so the log can be searched by name)', async () => {
        const res = await login('rec1@smile.example.com');
        const token = res.token;
        const since = new Date(); // only the line of THIS request (an earlier test made a nameless one)
        const r = await request(app).post('/api/patients').set('Authorization', `Bearer ${token}`).send({ name: `${MARK} named`, phone: '07501230002', age: 40 });
        expect(r.status).toBe(201);
        const row = await logRow(`path = '/api/patients' AND method = 'POST' AND actor_id = $2 AND created_at >= $3`, [jwt.decode(token).id, since]);
        const name = (await one(`SELECT full_name FROM profiles WHERE user_id = $1`, [jwt.decode(token).id])).full_name;
        expect(row.actor_name).toBe(name);
        await query(`DELETE FROM patients WHERE id = $1`, [r.body.data.id]);
    });

    it('the PLATFORM ADMIN\'s money actions are logged too (changing a plan price), never shown to a clinic', async () => {
        const before = N((await one(`SELECT count(*) n FROM audit_logs WHERE created_at >= $1 AND path LIKE '/api/plans/%'`, [startedAt])).n);
        const r = await call('PUT', '/api/plans/1', ADMIN, { price: N(saved.plan.price) });
        expect(r.status).toBe(200);
        await new Promise((res) => setTimeout(res, 300));
        const after = N((await one(`SELECT count(*) n FROM audit_logs WHERE created_at >= $1 AND path LIKE '/api/plans/%'`, [startedAt])).n);
        expect(after).toBe(before + 1);
        const row = await one(`SELECT tenant_id, actor_id, action FROM audit_logs WHERE created_at >= $1 AND path = '/api/plans/1' ORDER BY id DESC LIMIT 1`, [startedAt]);
        expect(row).toMatchObject({ tenant_id: null, actor_id: 8, action: 'plans.update' });
        const seen = await call('GET', '/api/audit?page=1', smile.manager);
        expect(seen.body.data.rows.some((x) => x.path === '/api/plans/1')).toBe(false);
    });
});

describe('who can read the log', () => {
    it('the clinic owner can; branch manager, doctor, reception cannot (403)', async () => {
        expect((await call('GET', '/api/audit', smile.manager)).status).toBe(200);
        for (const u of [S1.manager, S1.doctors[0], S1.reception]) expect((await call('GET', '/api/audit', u)).status).toBe(403);
    });

    it('a clinic only ever sees its OWN log lines', async () => {
        const r = await call('GET', '/api/audit?page=1', care.manager);
        const tenants = await all(`SELECT DISTINCT tenant_id FROM audit_logs WHERE id = ANY($1)`, [r.body.data.rows.map((x) => x.id)]);
        expect(tenants.map((t) => N(t.tenant_id))).toEqual(r.body.data.rows.length ? [care.tenant_id] : []);
    });

    it('search by name and by date works; 20 lines a page; the "to" day is included', async () => {
        const name = (await one(`SELECT actor_name FROM audit_logs WHERE tenant_id = $1 AND actor_name IS NOT NULL LIMIT 1`, [smile.tenant_id]))?.actor_name;
        if (name) {
            const r = await call('GET', `/api/audit?q=${encodeURIComponent(name.slice(0, 4))}`, smile.manager);
            expect(r.body.data.rows.every((x) => x.actor_name.toLowerCase().includes(name.slice(0, 4).toLowerCase()))).toBe(true);
        }
        const today = new Date().toISOString().slice(0, 10);
        const d = await call('GET', `/api/audit?from=${today}&to=${today}`, smile.manager);
        expect(d.status).toBe(200);
        expect(d.body.data.rows.length).toBeLessThanOrEqual(20);
        expect(d.body.data.total).toBeGreaterThan(0);
    });

    it('a wrong date in the search answers 400 VALIDATION_ERROR (not a server error)', async () => {
        const r = await call('GET', '/api/audit?from=abc&to=2026-13-45', smile.manager);
        expect([r.status, r.body.code]).toEqual([400, 'VALIDATION_ERROR']);
    });

    it('nobody can change or delete log lines (no such endpoints)', async () => {
        const id = (await one(`SELECT id FROM audit_logs WHERE tenant_id = $1 LIMIT 1`, [smile.tenant_id])).id;
        expect((await call('DELETE', `/api/audit/${id}`, smile.manager)).status).toBe(404);
        expect((await call('PUT', `/api/audit/${id}`, smile.manager, { action: 'x' })).status).toBe(404);
    });
});

describe('"switch branch" token', () => {
    it('the token from the owner\'s "open branch" lasts 1 hour like every other access token (not 10 hours)', async () => {
        const res = await login('manager@smile.example.com', S1.id);
        const token = res.token || res.data?.token;
        const sw = await request(app).post(`/api/tenants/switch-branch/${smile.branches[1].id}`).set('Authorization', `Bearer ${token}`);
        expect(sw.status).toBe(200);
        const d = jwt.decode(sw.body.token);
        expect((d.exp - d.iat) / 3600).toBeLessThanOrEqual(1);
    });

    it('after the owner opens a branch, renewing the token keeps that branch', async () => {
        const res = await login('manager@smile.example.com', S1.id);
        const sw = await request(app).post(`/api/tenants/switch-branch/${smile.branches[1].id}`).set('Authorization', `Bearer ${res.token}`);
        const refreshToken = sw.body.refreshToken || res.refreshToken;
        const rr = await request(app).post('/refresh').send({ refreshToken });
        const branch = jwt.decode(rr.body.token || '')?.branch_id;
        expect(N(branch)).toBe(smile.branches[1].id);
    });
});
