// PART 10 — Subscriptions, plans, paid features, clinic settings.
// Fixed 2026-11-24: settings saved in one real transaction + checked, branch limit locked, a plan the clinic does not fit
// is refused before paying, subscription dates with a time zone, branch input checked, one receipt image.
// Made-up clinics only; every subscription / plan / setting changed here is put back exactly.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import app from '../main.js';
import { call, one, all, query, loadClinic, tokenFor } from './helpers/testApp.js';

if (process.env.SUPABASE_URL) throw new Error('STOP: SUPABASE_URL is set — uploads in this test would go to real storage.');

const MARK = 'test-subscriptions';
const N = Number;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const ADMIN = { id: 8, tenant_id: null, branch_id: null }; // the platform admin of the test database
let smile, care, S1, saved = {};

// a separate connection (not the app's pool) to look at the database from outside
const outside = async (sql, params) => { const c = new pg.Client({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME_TEST }); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } };
const sendRequest = (user, fields, files = [PNG]) => {
    let r = request(app).post('/api/subscriptions/request').set('Authorization', `Bearer ${tokenFor(user)}`);
    for (const [k, v] of Object.entries(fields)) r = r.field(k, String(v));
    files.forEach((f, i) => { r = r.attach('images', f, { filename: `r${i}.png`, contentType: 'image/png' }); });
    return r;
};
const setEnd = (tenant_id, sql) => query(`UPDATE subscriptions SET end_date = ${sql} WHERE tenant_id = $1`, [tenant_id]);

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    care = await loadClinic('care.example.com');
    S1 = smile.branches[0];
    saved.subs = await all(`SELECT row_to_json(s)::text j FROM subscriptions s WHERE tenant_id = ANY($1)`, [[smile.tenant_id, care.tenant_id]]);
    saved.tenants = await all(`SELECT id, name, logo_url FROM tenants WHERE id = ANY($1)`, [[smile.tenant_id, care.tenant_id]]);
    saved.settings = await all(`SELECT tenant_id, timezone, currency_code FROM tenant_settings WHERE tenant_id = ANY($1)`, [[smile.tenant_id, care.tenant_id]]);
    saved.plans = await all(`SELECT id, max_branches, included_doctors, extra_doctor_price, extra_doctor_yearly_price FROM plans`);
});

afterAll(async () => {
    await outside(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%' AND pid <> pg_backend_pid()`);
    for (const { j } of saved.subs) {
        const cols = Object.keys(JSON.parse(j)).filter((c) => c !== 'id');
        await outside(`UPDATE subscriptions SET ${cols.map((c) => `${c} = b.${c}`).join(', ')} FROM json_populate_record(NULL::subscriptions, $1::json) b WHERE subscriptions.id = b.id`, [j]);
    }
    for (const t of saved.tenants) await outside(`UPDATE tenants SET name = $2, logo_url = $3 WHERE id = $1`, [t.id, t.name, t.logo_url]);
    for (const s of saved.settings) await outside(`UPDATE tenant_settings SET timezone = $2, currency_code = $3 WHERE tenant_id = $1`, [s.tenant_id, s.timezone, s.currency_code]);
    for (const p of saved.plans) await outside(`UPDATE plans SET max_branches = $2, included_doctors = $3, extra_doctor_price = $4, extra_doctor_yearly_price = $5 WHERE id = $1`, [p.id, p.max_branches, p.included_doctors, p.extra_doctor_price, p.extra_doctor_yearly_price]);
    await outside(`DELETE FROM subscription_requests WHERE tenant_id = ANY($1)`, [[smile.tenant_id, care.tenant_id]]);
    await outside(`DELETE FROM tenant_feature_grants WHERE note = $1`, [MARK]);
    const extra = await outside(`SELECT id FROM branches WHERE name LIKE $1`, [`${MARK}%`]);
    for (const b of extra) { await outside(`DELETE FROM branch_role_permissions WHERE branch_id = $1`, [b.id]); await outside(`DELETE FROM branch_settings WHERE branch_id = $1`, [b.id]); await outside(`DELETE FROM branches WHERE id = $1`, [b.id]); }
});

// =====================================================================================
describe('an EXPIRED subscription', () => {
    it('blocks the clinic (403 SUBSCRIPTION_EXPIRED) but lets it see its status and send a renewal', async () => {
        await setEnd(smile.tenant_id, `NOW() - interval '1 day'`);
        try {
            for (const path of ['/api/patients', '/api/appointments/calendar?from=2026-11-01T00:00:00Z&to=2026-11-08T00:00:00Z', '/api/reports/monthly/pdf?month=2026-10-01']) {
                const r = await call('GET', path, S1.manager);
                expect([r.status, r.body.code]).toEqual([403, 'SUBSCRIPTION_EXPIRED']);
            }
            const me = await call('GET', '/api/subscriptions/me', S1.manager);
            expect(me.status).toBe(200);
            expect(me.body.data.status).toBe('expired');
            expect((await call('POST', '/api/patients', S1.reception, { name: 'blocked', phone: '07500000001', age: 30 })).status).toBe(403);
        } finally {
            await setEnd(smile.tenant_id, `NOW() + interval '30 days'`);
        }
    });

    // the end date has a time zone now: right even though this test database runs on Los Angeles time and this PC on Iraq time
    it('5 seconds before the end is still open; 1 second after is closed (whatever time zone the database uses)', async () => {
        await setEnd(smile.tenant_id, `NOW() + interval '5 seconds'`);
        expect((await call('GET', '/api/patients', S1.manager)).status).toBe(200);
        await setEnd(smile.tenant_id, `NOW() - interval '1 second'`);
        expect((await call('GET', '/api/patients', S1.manager)).status).toBe(403);
        await setEnd(smile.tenant_id, `NOW() + interval '30 days'`);
    });
});

// =====================================================================================
describe('renewal / upgrade requests (money)', () => {
    it('renewal is refused while more than 7 days are left (RENEW_NOT_ALLOWED_YET)', async () => {
        await setEnd(smile.tenant_id, `NOW() + interval '30 days'`);
        const r = await sendRequest(smile.manager, { plan_id: 2, billing_period: 'monthly' });
        expect([r.status, r.body.code]).toEqual([400, 'RENEW_NOT_ALLOWED_YET']);
    });

    it('the amount saved = the quote the clinic saw (plan price + extra doctors), never a number sent by the clinic', async () => {
        await setEnd(smile.tenant_id, `NOW() + interval '3 days'`);
        const quote = (await call('GET', '/api/subscriptions/me/quote?plan_id=2&billing_period=yearly', smile.manager)).body.data;
        // the clinic cannot send its own amount: an extra field is refused
        const cheat = await sendRequest(smile.manager, { plan_id: 2, billing_period: 'yearly', amount: 1 });
        expect([cheat.status, cheat.body.code]).toEqual([400, 'VALIDATION_ERROR']);
        const r = await sendRequest(smile.manager, { plan_id: 2, billing_period: 'yearly' });
        expect(r.status).toBe(201);
        const row = await one(`SELECT amount, billing_period, status FROM subscription_requests WHERE id = $1`, [r.body.data.id]);
        expect(N(row.amount)).toBe(quote.total);
        expect(row).toMatchObject({ billing_period: 'yearly', status: 'pending' });
        // Pro yearly 1068 + doctors over 6 x 12 x 12... the formula itself:
        const doctors = quote.doctors, extra = Math.max(0, doctors - 6);
        expect(quote.total).toBe(1068 + extra * N((await one(`SELECT extra_doctor_yearly_price p FROM plans WHERE id = 2`)).p));
        // a second request while one is waiting -> 409
        const again = await sendRequest(smile.manager, { plan_id: 2, billing_period: 'monthly' });
        expect([again.status, again.body.code]).toEqual([409, 'REQUEST_ALREADY_PENDING']);
        saved.requestId = r.body.data.id;
    });

    it('approving extends from the END date (days left are not lost), once only', async () => {
        const before = await one(`SELECT end_date FROM subscriptions WHERE tenant_id = $1`, [smile.tenant_id]);
        const a1 = await call('POST', `/api/subscriptions/requests/${saved.requestId}/approve`, ADMIN);
        expect(a1.status).toBe(200);
        const after = await one(`SELECT end_date, billing_period, plan_id FROM subscriptions WHERE tenant_id = $1`, [smile.tenant_id]);
        const days = (new Date(after.end_date) - new Date(before.end_date)) / 86400000;
        expect(Math.round(days)).toBe(372);
        expect(after.billing_period).toBe('yearly');
        const a2 = await call('POST', `/api/subscriptions/requests/${saved.requestId}/approve`, ADMIN);
        expect([a2.status, a2.body.code]).toEqual([409, 'REQUEST_NOT_PENDING']);
    });

    it('two approvals at the same moment: the subscription is extended ONCE', async () => {
        await setEnd(smile.tenant_id, `NOW() + interval '3 days'`);
        const r = await sendRequest(smile.manager, { plan_id: 2, billing_period: 'monthly' });
        const before = await one(`SELECT end_date FROM subscriptions WHERE tenant_id = $1`, [smile.tenant_id]);
        const rs = await Promise.all([1, 2, 3].map(() => call('POST', `/api/subscriptions/requests/${r.body.data.id}/approve`, ADMIN)));
        expect(rs.map((x) => x.status).sort()).toEqual([200, 409, 409]);
        const after = await one(`SELECT end_date FROM subscriptions WHERE tenant_id = $1`, [smile.tenant_id]);
        expect(Math.round((new Date(after.end_date) - new Date(before.end_date)) / 86400000)).toBe(37);
    });

    it('a clinic cannot approve its own request; only the platform admin can', async () => {
        await setEnd(smile.tenant_id, `NOW() + interval '3 days'`);
        const r = await sendRequest(smile.manager, { plan_id: 2, billing_period: 'monthly' });
        expect((await call('POST', `/api/subscriptions/requests/${r.body.data.id}/approve`, smile.manager)).status).toBe(403);
        expect((await call('GET', '/api/subscriptions/requests', smile.manager)).status).toBe(403);
        expect((await call('POST', `/api/subscriptions/requests/${r.body.data.id}/reject`, ADMIN, { note: MARK })).status).toBe(200);
    });

    it('only the clinic owner (manage_subscription) can send a renewal; staff cannot', async () => {
        await setEnd(smile.tenant_id, `NOW() + interval '3 days'`);
        for (const u of [S1.manager, S1.reception, S1.doctors[0]]) {
            const r = await sendRequest(u, { plan_id: 2, billing_period: 'monthly' });
            expect(r.status).toBe(403);
        }
    });

    it('a renewal receipt is ONE image (sending 5 images is refused, like sign-up and profile)', async () => {
        await setEnd(smile.tenant_id, `NOW() + interval '3 days'`);
        await query(`DELETE FROM subscription_requests WHERE tenant_id = $1 AND status = 'pending'`, [smile.tenant_id]);
        const r = await sendRequest(smile.manager, { plan_id: 2, billing_period: 'monthly' }, [PNG, PNG, PNG, PNG, PNG]);
        const n = N((await one(`SELECT count(*) n FROM subscription_requests WHERE tenant_id = $1 AND status = 'pending'`, [smile.tenant_id])).n);
        await query(`DELETE FROM subscription_requests WHERE tenant_id = $1 AND status = 'pending'`, [smile.tenant_id]);
        expect([r.status, r.body.code, n]).toEqual([400, 'UPLOAD_ERROR', 0]);
        // one image still works
        const ok = await sendRequest(smile.manager, { plan_id: 2, billing_period: 'monthly' }, [PNG]);
        await query(`DELETE FROM subscription_requests WHERE tenant_id = $1 AND status = 'pending'`, [smile.tenant_id]);
        expect(ok.status).toBe(201);
    });

    it('moving DOWN to a plan the clinic does not fit (3 branches -> Basic allows 1) is refused before paying', async () => {
        await setEnd(smile.tenant_id, `NOW() + interval '3 days'`);
        await query(`DELETE FROM subscription_requests WHERE tenant_id = $1 AND status = 'pending'`, [smile.tenant_id]);
        const r = await sendRequest(smile.manager, { plan_id: 1, billing_period: 'monthly' });
        const n = N((await one(`SELECT count(*) n FROM subscription_requests WHERE tenant_id = $1 AND status = 'pending'`, [smile.tenant_id])).n);
        await query(`DELETE FROM subscription_requests WHERE tenant_id = $1 AND status = 'pending'`, [smile.tenant_id]);
        expect([r.status, r.body.code, n]).toEqual([409, 'PLAN_TOO_SMALL_BRANCHES', 0]);
        expect(r.body.message).toContain('allows 1 branches; your clinic has 3');
    });

    it('moving to a plan with too few doctors and no "extra doctor" price is refused (PLAN_TOO_SMALL_DOCTORS); with an extra price the doctors are billed', async () => {
        await setEnd(smile.tenant_id, `NOW() + interval '3 days'`);
        await query(`DELETE FROM subscription_requests WHERE tenant_id = $1 AND status = 'pending'`, [smile.tenant_id]);
        const doctors = (await call('GET', '/api/subscriptions/me/quote?plan_id=2&billing_period=monthly', smile.manager)).body.data.doctors;
        // Pro for this test: only 2 doctors and NO extra doctors allowed
        await query(`UPDATE plans SET included_doctors = 2, extra_doctor_price = -1 WHERE id = 2`);
        await query(`UPDATE subscriptions SET plan_id = 11 WHERE tenant_id = $1`, [smile.tenant_id]); // so Pro is a CHANGE (no price lock)
        try {
            const r = await sendRequest(smile.manager, { plan_id: 2, billing_period: 'monthly' });
            expect([r.status, r.body.code]).toEqual([409, 'PLAN_TOO_SMALL_DOCTORS']);
            expect(r.body.message).toContain(`allows 2 doctors; your clinic has ${doctors}`);
            await query(`UPDATE plans SET extra_doctor_price = 12 WHERE id = 2`);
            const billed = await sendRequest(smile.manager, { plan_id: 2, billing_period: 'monthly' });
            expect(billed.status).toBe(201);
            expect(N((await one(`SELECT amount FROM subscription_requests WHERE id = $1`, [billed.body.data.id])).amount)).toBe(89 + (doctors - 2) * 12);
        } finally {
            await query(`DELETE FROM subscription_requests WHERE tenant_id = $1 AND status = 'pending'`, [smile.tenant_id]);
            await query(`UPDATE plans SET included_doctors = 6, extra_doctor_price = 12 WHERE id = 2`);
            await query(`UPDATE subscriptions SET plan_id = 2 WHERE tenant_id = $1`, [smile.tenant_id]);
        }
    });

    it('a clinic that fits keeps renewing as before (Smile on Pro, Care on Enterprise)', async () => {
        for (const [c, plan] of [[smile, 2], [care, 11], [care, 2]]) {
            await setEnd(c.tenant_id, `NOW() + interval '3 days'`);
            await query(`DELETE FROM subscription_requests WHERE tenant_id = $1 AND status = 'pending'`, [c.tenant_id]);
            const r = await sendRequest(c.manager, { plan_id: plan, billing_period: 'monthly' });
            await query(`DELETE FROM subscription_requests WHERE tenant_id = $1 AND status = 'pending'`, [c.tenant_id]);
            expect([plan, r.status]).toEqual([plan, 201]);
        }
        await setEnd(care.tenant_id, `NOW() + interval '30 days'`);
    });
});

// =====================================================================================
describe('plan limits', () => {
    it('Pro allows 3 branches: the 4th is refused (PLAN_LIMIT_REACHED)', async () => {
        const r = await call('POST', '/api/tenants/branches', smile.manager, { name: `${MARK} 4th`, location: 'x' });
        expect([r.status, r.body.code]).toEqual([403, 'PLAN_LIMIT_REACHED']);
    });

    it('three "add branch" clicks at the same moment cannot go over the limit', async () => {
        // Pro is set to 4 for this test: Smile has 3, so exactly ONE more may be added
        await query(`UPDATE plans SET max_branches = 4 WHERE id = 2`);
        const rs = await Promise.all([1, 2, 3].map((i) => call('POST', '/api/tenants/branches', smile.manager, { name: `${MARK} race ${i}`, location: 'x' })));
        await query(`UPDATE plans SET max_branches = 3 WHERE id = 2`);
        const made = N((await one(`SELECT count(*) n FROM branches WHERE tenant_id = $1 AND name LIKE $2`, [smile.tenant_id, `${MARK} race%`])).n);
        expect({ made, statuses: rs.map((x) => x.status).sort() }).toEqual({ made: 1, statuses: [201, 403, 403] });
    });

    it('adding / editing a branch with wrong input answers 400 VALIDATION_ERROR (no name, location over 50, bad time zone / currency / status)', async () => {
        for (const body of [{ location: 'x' }, { name: '   ' }, { name: `${MARK} L`, location: 'L'.repeat(51) }, { name: `${MARK} T`, timezone: 'Mars/Phobos' }, { name: `${MARK} C`, currency_code: 'usd' }, { name: `${MARK} S`, status: 'paused' }]) {
            const r = await call('POST', '/api/tenants/branches', care.manager, body);
            expect([JSON.stringify(body), r.status, r.body.code]).toEqual([JSON.stringify(body), 400, 'VALIDATION_ERROR']);
        }
        for (const body of [{ name: '' }, { location: 'L'.repeat(51) }, { status: 'paused' }]) {
            const r = await call('PUT', `/api/tenants/branches/${care.branches[0].id}`, care.manager, body);
            expect([JSON.stringify(body), r.status, r.body.code]).toEqual([JSON.stringify(body), 400, 'VALIDATION_ERROR']);
        }
        // none of the wrong ones was saved (the race test above made one real branch; it is removed at the end)
        expect(N((await one(`SELECT count(*) n FROM branches WHERE name = ANY($1)`, [['   ', `${MARK} L`, `${MARK} T`, `${MARK} C`, `${MARK} S`]])).n)).toBe(0);
    });

    it('a branch with an empty time zone / currency takes the clinic\'s (as the screen sends it), and a 50-letter location is fine', async () => {
        const r = await call('POST', '/api/tenants/branches', care.manager, { name: `${MARK} inherit`, location: 'L'.repeat(50), timezone: '', currency_code: '', status: 'active' });
        expect(r.status).toBe(201);
        const s = await one(`SELECT timezone, currency_code FROM branch_settings WHERE branch_id = $1`, [r.body.data.id]);
        const t = await one(`SELECT timezone, currency_code FROM tenant_settings WHERE tenant_id = $1`, [care.tenant_id]);
        expect(s).toEqual(t);
        const e = await call('PUT', `/api/tenants/branches/${r.body.data.id}`, care.manager, { name: `${MARK} inherit 2`, location: 'Kirkuk', timezone: 'Asia/Baghdad', currency_code: 'USD', status: 'inactive' });
        expect(e.status).toBe(200);
    });
});

// =====================================================================================
describe('paid features are enforced by the SERVER (not only hidden on the screen)', () => {
    const asBasic = async (fn) => {
        await query(`UPDATE subscriptions SET plan_id = 1 WHERE tenant_id = $1`, [smile.tenant_id]);
        try { await fn(); } finally { await query(`UPDATE subscriptions SET plan_id = 2 WHERE tenant_id = $1`, [smile.tenant_id]); }
    };

    it('on Basic: activity log, Insights, Excel, custom roles -> 403 FEATURE_NOT_INCLUDED; the branch overview is the short one', async () => {
        await asBasic(async () => {
            for (const path of ['/api/audit', '/api/reports/insights/revenue_total?month=2026-10-01', '/api/reports/insights/excel?month=2026-10']) {
                const r = await call('GET', path, smile.manager);
                expect([path, r.status, r.body.code]).toEqual([path, 403, 'FEATURE_NOT_INCLUDED']);
            }
            const base = await one(`SELECT id FROM roles WHERE name = 'reception' AND tenant_id IS NULL`);
            const role = await call('POST', '/api/role-permissions', smile.managerIn(S1.id), { name: `${MARK} role`, base_role_id: N(base.id) });
            expect([role.status, role.body.code]).toEqual([403, 'FEATURE_NOT_INCLUDED']);
            const dash = (await call('GET', '/api/branches/dashboard', S1.manager)).body.data;
            expect([dash.full_overview, dash.doctors, dash.busy]).toEqual([false, null, null]);
        });
    });

    it('an extra feature given to one clinic works until it runs out', async () => {
        await asBasic(async () => {
            const f = await one(`SELECT id FROM features WHERE code = 'audit_log'`);
            await query(`INSERT INTO tenant_feature_grants (tenant_id, feature_id, expires_at, note, granted_by) VALUES ($1, $2, NOW() + interval '1 day', $3, 8)`, [smile.tenant_id, f.id, MARK]);
            expect((await call('GET', '/api/audit', smile.manager)).status).toBe(200);
            await query(`UPDATE tenant_feature_grants SET expires_at = NOW() - interval '1 second' WHERE note = $1`, [MARK]);
            expect((await call('GET', '/api/audit', smile.manager)).status).toBe(403);
        });
    });
});

// =====================================================================================
describe('platform admin endpoints are closed to clinics', () => {
    it('plans / features / all subscriptions / clinic list: 403 for a clinic owner', async () => {
        for (const [m, p, b] of [['POST', '/api/plans', { name: 'x', price: 1 }], ['PUT', '/api/plans/1', { price: 0 }], ['DELETE', '/api/plans/1'],
            ['POST', '/api/features/plan/1', { feature_id: 1 }], ['POST', `/api/features/tenant/${smile.tenant_id}`, { feature_id: 1 }],
            ['GET', '/api/subscriptions'], ['PUT', `/api/subscriptions/1/tenant/${smile.tenant_id}`, { plan_id: 11 }], ['GET', '/api/admin-platform/tenants']]) {
            const r = await call(m, p, smile.manager, b);
            expect([m, p, r.status]).toEqual([m, p, 403]);
        }
        expect(N((await one(`SELECT price FROM plans WHERE id = 1`)).price)).toBe(49);
    });
});

// =====================================================================================
// LAST: this one can leave a connection of the app's pool stuck, so it runs after everything else
describe('clinic settings save (name / logo / time zone / currency)', () => {
    it('a wrong currency (USDX) is refused with 400 and NOTHING is half-saved; other requests keep working', async () => {
        const name = saved.tenants.find((t) => N(t.id) === smile.tenant_id).name;
        const r = await call('PUT', '/api/tenants', smile.manager, { name: `${MARK} renamed`, currency_code: 'USDX' });
        const nowName = (await outside(`SELECT name FROM tenants WHERE id = $1`, [smile.tenant_id]))[0].name;
        // and the bad save must not break OTHER people's requests that come after it
        const after = await Promise.all([1, 2, 3, 4, 5, 6].map(() => call('GET', '/api/patients?limit=1', S1.reception)));
        const broken = after.filter((x) => x.status !== 200).length;
        const stuck = N((await outside(`SELECT count(*) n FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'`))[0].n);
        expect({ status: r.status, name_saved_anyway: nowName !== name, stuck_connections: stuck, other_requests_failing: broken }).toEqual({ status: 400, name_saved_anyway: false, stuck_connections: 0, other_requests_failing: 0 });
        expect(r.body.code).toBe('VALIDATION_ERROR');
    });

    it('wrong settings are refused (empty name, bad time zone, small-letter currency); right ones are saved together', async () => {
        for (const body of [{ name: '   ' }, { timezone: 'Mars/Phobos' }, { currency_code: 'iqd' }, { timezone: '' }]) {
            const r = await call('PUT', '/api/tenants', smile.manager, body);
            expect([JSON.stringify(body), r.status, r.body.code]).toEqual([JSON.stringify(body), 400, 'VALIDATION_ERROR']);
        }
        const r = await call('PUT', '/api/tenants', smile.manager, { name: `${MARK} ok`, logo_url: '', timezone: 'Europe/Berlin', currency_code: 'EUR' });
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ timezone: 'Europe/Berlin', currency_code: 'EUR' });
        const now = (await outside(`SELECT t.name, ts.timezone, ts.currency_code FROM tenants t JOIN tenant_settings ts ON ts.tenant_id = t.id WHERE t.id = $1`, [smile.tenant_id]))[0];
        expect(now).toEqual({ name: `${MARK} ok`, timezone: 'Europe/Berlin', currency_code: 'EUR' });
        const orig = saved.tenants.find((t) => N(t.id) === smile.tenant_id), os = saved.settings.find((x) => N(x.tenant_id) === smile.tenant_id);
        await call('PUT', '/api/tenants', smile.manager, { name: orig.name, timezone: os.timezone, currency_code: os.currency_code });
    });

    it('settings saves at the same time as other people\'s work: no connection stuck "inside an open transaction", no other write lost', async () => {
        const STUCK = `SELECT count(*) n FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'`;
        const CLOSE_STUCK = `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%' AND pid <> pg_backend_pid()`;
        const KEPT = `SELECT count(*) n FROM monthly_expenses WHERE type = $1`;
        await outside(CLOSE_STUCK);
        const name = saved.tenants.find((t) => N(t.id) === smile.tenant_id).name;
        const work = [];
        for (let i = 0; i < 10; i++) {
            work.push(call('PUT', '/api/tenants', smile.manager, { name }));
            work.push(call('POST', '/api/monthly-expenses', smile.branches[i % 3].manager, { type: MARK, amount: 1000 + i, expense_date: '2026-11-20' }));
        }
        // if the requests freeze, record what the database is doing (instead of only timing out)
        const rs = await Promise.race([Promise.all(work), new Promise((r) => setTimeout(() => r(null), 10000))]);
        if (!rs) {
            const snap = await outside(`SELECT state, wait_event_type, wait_event, left(query, 70) q, count(*) n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC`);
            await outside(CLOSE_STUCK);
            expect({ frozen_after_10s: true, database: snap }).toEqual({ frozen_after_10s: false });
        }
        const saidSaved = rs.filter((r) => r.status === 201).length;
        await new Promise((res) => setTimeout(res, 500));
        const stuck = N((await outside(STUCK))[0].n);
        // what the database REALLY kept (seen from outside the app)
        const kept = N((await outside(KEPT, [MARK]))[0].n);
        // a stuck connection that is closed (restart, timeout) throws away what it was holding
        await outside(CLOSE_STUCK);
        const keptAfterClose = N((await outside(KEPT, [MARK]))[0].n);
        await outside(`DELETE FROM monthly_expenses WHERE type = $1`, [MARK]);
        expect({ saidSaved, stuck, kept, keptAfterClose }).toEqual({ saidSaved: 10, stuck: 0, kept: 10, keptAfterClose: 10 });
    });
});
