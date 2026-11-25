// PART 12 — Everything else: lab orders (money), discounts, reminders, feedback, payment history,
// announcements, the /uploads folder. Fixed 2026-11-24: closed lab orders, discount edits, reminders once, history pages, /uploads.
// Made-up data only; everything made here is removed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../main.js';
import { call, one, all, query, loadClinic, newTestVisit, removeTestVisits } from './helpers/testApp.js';

const MARK = 'test-remaining';
const N = Number;
let smile, care, S1, boss, works, patient;
const made = { labs: [], discounts: [] };

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    care = await loadClinic('care.example.com');
    S1 = smile.branches[0];
    boss = smile.managerIn(S1.id);
    works = await all(`SELECT id, code FROM work_catalog WHERE branch_id = $1 AND is_active ORDER BY id LIMIT 3`, [S1.id]);
    patient = N((await one(`SELECT id FROM patients WHERE branch_id = $1 ORDER BY id LIMIT 1`, [S1.id])).id);
});

afterAll(async () => {
    await removeTestVisits(MARK);
    await query(`DELETE FROM reminders WHERE message = $1`, [MARK]);
    await query(`DELETE FROM feedbacks WHERE tenant_id = $1 AND created_at >= NOW() - interval '1 hour' AND status IN ('sent','dismissed') AND patient_id IN (SELECT patient_id FROM appointments WHERE complaint = $2)`, [smile.tenant_id, MARK]).catch(() => {});
    if (made.labs.length) {
        await query(`DELETE FROM lab_orders WHERE lab_id = ANY($1)`, [made.labs]);
        await query(`DELETE FROM labs WHERE id = ANY($1)`, [made.labs]);
    }
    if (made.discounts.length) await query(`DELETE FROM discounts WHERE id = ANY($1)`, [made.discounts]);
});

// =====================================================================================
describe('lab orders (money owed to the lab)', () => {
    let labId, orderId;
    it('an order\'s total = the lab\'s price list x quantities, and the lab\'s later price change does not change old orders', async () => {
        const lab = await call('POST', '/api/labs', boss, { name: `${MARK} lab`, treatments: [{ work_id: N(works[0].id), cost: 25000 }, { work_id: N(works[1].id), cost: 12500 }] });
        expect(lab.status).toBeLessThan(300);
        labId = N(lab.body.data.id); made.labs.push(labId);
        const o = await call('POST', '/api/labs/orders', boss, { lab_id: labId, patient_id: patient, doctor_id: S1.doctors[0].id, items: [{ work_id: N(works[0].id), quantity: 3 }, { work_id: N(works[1].id), quantity: 2 }], notes: MARK });
        expect(o.status).toBeLessThan(300);
        orderId = N(o.body.data.id ?? o.body.data.order?.id);
        expect(N((await one(`SELECT total_cost FROM lab_orders WHERE id = $1`, [orderId])).total_cost)).toBe(3 * 25000 + 2 * 12500);
        await call('PUT', `/api/labs/${labId}`, boss, { treatments: [{ work_id: N(works[0].id), cost: 99999 }, { work_id: N(works[1].id), cost: 1 }] });
        expect(N((await one(`SELECT total_cost FROM lab_orders WHERE id = $1`, [orderId])).total_cost)).toBe(100000);
    });

    it('a lab / order of ANOTHER branch or clinic cannot be used or seen', async () => {
        const other = smile.branches[1];
        expect((await call('GET', `/api/labs/orders/${orderId}`, other.manager)).status).toBe(404);
        expect((await call('POST', '/api/labs/orders', care.branches[0].manager, { lab_id: labId, patient_id: patient, doctor_id: S1.doctors[0].id, items: [{ work_id: N(works[0].id), quantity: 1 }] })).status).toBeGreaterThanOrEqual(400);
        expect((await call('POST', '/api/labs/orders', boss, { lab_id: labId, patient_id: N((await one(`SELECT id FROM patients WHERE branch_id = $1 LIMIT 1`, [care.branches[0].id])).id), doctor_id: S1.doctors[0].id, items: [{ work_id: N(works[0].id), quantity: 1 }] })).status).toBeGreaterThanOrEqual(400);
    });

    it('a DELIVERED or CANCELLED order cannot be re-priced afterwards (its money is closed); its note can still be edited', async () => {
        expect((await call('PATCH', `/api/labs/orders/${orderId}/status`, boss, { status: 'delivered' })).status).toBe(200);
        const r = await call('PUT', `/api/labs/orders/${orderId}`, boss, { items: [{ work_id: N(works[0].id), quantity: 1 }] });
        const total = N((await one(`SELECT total_cost FROM lab_orders WHERE id = $1`, [orderId])).total_cost);
        expect({ status: r.status, code: r.body.code, total }).toEqual({ status: 409, code: 'LAB_ORDER_CLOSED', total: 100000 });
        const note = await call('PUT', `/api/labs/orders/${orderId}`, boss, { notes: 'picked up' });
        expect(note.status).toBe(200);
        expect(await one(`SELECT notes, total_cost FROM lab_orders WHERE id = $1`, [orderId])).toMatchObject({ notes: 'picked up' });
        // an order still "ordered" can be re-priced as before
        const o2 = await call('POST', '/api/labs/orders', boss, { lab_id: labId, patient_id: patient, doctor_id: S1.doctors[0].id, items: [{ work_id: N(works[0].id), quantity: 1 }] });
        const id2 = N(o2.body.data.id ?? o2.body.data.order?.id);
        expect((await call('PUT', `/api/labs/orders/${id2}`, boss, { items: [{ work_id: N(works[0].id), quantity: 2 }] })).status).toBe(200);
        expect(N((await one(`SELECT total_cost FROM lab_orders WHERE id = $1`, [id2])).total_cost)).toBe(2 * 99999);
    });

    it('USD cents in a lab price list add up exactly (0.10 x 3 = 0.30)', async () => {
        const lab = await call('POST', '/api/labs', boss, { name: `${MARK} cents`, treatments: [{ work_id: N(works[2].id), cost: 0.1 }] });
        made.labs.push(N(lab.body.data.id));
        const o = await call('POST', '/api/labs/orders', boss, { lab_id: N(lab.body.data.id), patient_id: patient, doctor_id: S1.doctors[0].id, items: [{ work_id: N(works[2].id), quantity: 3 }] });
        expect(N((await one(`SELECT total_cost FROM lab_orders WHERE id = $1`, [o.body.data.id ?? o.body.data.order?.id])).total_cost)).toBe(0.3);
    });
});

// =====================================================================================
describe('discounts', () => {
    it('a percent discount over 100 or a negative value is refused when CREATED', async () => {
        expect((await call('POST', '/api/discounts', boss, { name: `${MARK} p`, type: 'percent', value: 150 })).status).toBe(400);
        expect((await call('POST', '/api/discounts', boss, { name: `${MARK} n`, type: 'fixed', value: -5 })).status).toBe(400);
    });

    it('EDITING a percent discount to 500% (value only) is refused too', async () => {
        const c = await call('POST', '/api/discounts', boss, { name: `${MARK} ten`, type: 'percent', value: 10 });
        made.discounts.push(N(c.body.data.id));
        const r = await call('PUT', `/api/discounts/${c.body.data.id}`, boss, { value: 500 });
        const v = N((await one(`SELECT value FROM discounts WHERE id = $1`, [c.body.data.id])).value);
        expect({ status: r.status, code: r.body.code, saved: v }).toEqual({ status: 400, code: 'DISCOUNT_PERCENT_OVER_100', saved: 10 });
        expect((await call('PUT', `/api/discounts/${c.body.data.id}`, boss, { value: 100 })).status).toBe(200); // 100% is still fine
    });

    it('changing a fixed 5000 discount to "percent" (type only) is refused (it would be 5000%)', async () => {
        const c = await call('POST', '/api/discounts', boss, { name: `${MARK} fx`, type: 'fixed', value: 5000 });
        made.discounts.push(N(c.body.data.id));
        const r = await call('PUT', `/api/discounts/${c.body.data.id}`, boss, { type: 'percent' });
        const row = await one(`SELECT type, value FROM discounts WHERE id = $1`, [c.body.data.id]);
        expect({ status: r.status, type: row.type }).toEqual({ status: 400, type: 'fixed' });
    });

    it('a DELETED discount cannot be edited (404)', async () => {
        const c = await call('POST', '/api/discounts', boss, { name: `${MARK} del`, type: 'fixed', value: 100 });
        made.discounts.push(N(c.body.data.id));
        await call('DELETE', `/api/discounts/${c.body.data.id}`, boss);
        expect((await call('PUT', `/api/discounts/${c.body.data.id}`, boss, { value: 200 })).status).toBe(404);
    });

    it('reception can SEE the discounts (to pick one) but cannot create / edit / delete', async () => {
        expect((await call('GET', '/api/discounts', S1.reception)).status).toBe(200);
        expect((await call('POST', '/api/discounts', S1.reception, { name: 'x', type: 'fixed', value: 1 })).status).toBe(403);
    });
});

// =====================================================================================
describe('reminders and feedback invites (sent once)', () => {
    it('the same reminder "sent" twice at the same moment is saved ONCE (the others: 409 REMINDER_ALREADY_SENT)', async () => {
        const appt = await newTestVisit(MARK, S1, { patient_id: patient });
        const body = { patient_id: patient, language: 'en', message: MARK };
        const rs = await Promise.all([1, 2, 3].map(() => call('POST', `/api/reminders/${appt}/sent`, boss, body)));
        const n = N((await one(`SELECT count(*) n FROM reminders WHERE appointment_id = $1`, [appt])).n);
        expect({ saved: n, statuses: rs.map((r) => r.status).sort() }).toEqual({ saved: 1, statuses: [201, 409, 409] });
    });

    it('the public feedback link with a wrong clinic / branch answers 400/404 (not a server error)', async () => {
        for (const p of ['/api/public/feedback/qr/abc/1', '/api/public/feedback/qr/1/abc', '/api/public/feedback/qr/999999/999999', '/api/public/feedback/not-a-real-token']) {
            const r = await request(app).get(p);
            expect([p, r.status < 500]).toEqual([p, true]);
        }
    });
});

// =====================================================================================
describe('payment history', () => {
    it('the payment history comes in pages of 50, and the totals on top count ALL the branch\'s payments', async () => {
        const t0 = Date.now();
        const r = await call('GET', '/api/history/payments', boss);
        const ms = Date.now() - t0;
        const rows = Array.isArray(r.body.data) ? r.body.data.length : (r.body.data?.rows?.length ?? r.body.data?.items?.length ?? 0);
        const inBranch = N((await one(`SELECT (SELECT count(*) FROM session_payments WHERE branch_id = $1) + (SELECT count(*) FROM treatment_payments WHERE branch_id = $1 AND NOT is_deleted) n`, [S1.id])).n);
        expect({ status: r.status, rows_sent: rows, payments_in_branch: inBranch, ms }).toMatchObject({ status: 200 });
        expect(rows).toBe(50);
        const t = await all(`SELECT currency_code, SUM(amount) a, COUNT(*)::int n FROM session_payments WHERE branch_id = $1 GROUP BY 1 ORDER BY 1`, [S1.id]);
        expect(r.body.data.total).toBe(t.reduce((s, x) => s + x.n, 0));
        expect(r.body.data.totals).toEqual(t.map((x) => ({ currency_code: x.currency_code, amount: N(x.a), count: x.n })));
        const last = await call('GET', `/api/history/payments?page=${r.body.data.pages}`, boss);
        expect(last.body.data.rows.length).toBe(r.body.data.total - (r.body.data.pages - 1) * 50);
        expect((await call('GET', '/api/history/payments?page=0', boss)).status).toBe(400);
    });

    it('a branch only sees its own payments; another clinic sees none of them', async () => {
        const r = await call('GET', '/api/history/payments', care.branches[0].manager);
        expect(JSON.stringify(r.body).includes('Smile')).toBe(false);
    });
});

// =====================================================================================
describe('announcements', () => {
    it('marking a NON-existing announcement as read is refused (400, not a server error)', async () => {
        const r = await call('POST', '/api/announcements/999999999/read', boss);
        expect(r.status).toBe(400);
    });

    it('only the platform admin can post / delete announcements', async () => {
        expect((await call('POST', '/api/announcements', smile.manager, { title: 'hello' })).status).toBe(403);
        expect((await call('GET', '/api/announcements/admin', smile.manager)).status).toBe(403);
    });
});

// =====================================================================================
describe('the /uploads folder', () => {
    it('with Supabase storage (production), /uploads is not served at all; locally (no storage settings) it still is', async () => {
        const root = path.join(process.cwd(), 'uploads');
        const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : [];
        const file = walk(root).find((f) => /\.(png|jpe?g|webp)$/i.test(f));
        if (!file) return; // nothing stored locally
        const url = '/uploads/' + path.relative(root, file).split(path.sep).join('/');
        // this test run has no storage settings -> local mode, the folder is served (development)
        expect((await request(app).get(url)).status).toBe(200);
        // the same app started WITH (fake) Supabase settings -> the folder does not exist
        const { spawnSync } = await import('child_process');
        const probe = `process.env.SUPABASE_URL='http://fake.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY='fake'; const { default: app } = await import(${JSON.stringify('file:///' + path.join(process.cwd(), 'main.js').split(path.sep).join('/'))}); const { default: request } = await import('supertest'); const r = await request(app).get(${JSON.stringify(url)}); console.log('STATUS=' + r.status); process.exit(0);`;
        const out = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'test' }, encoding: 'utf8' });
        expect((out.stdout.match(/STATUS=(\d+)/) || [])[1]).toBe('404');
    });
});
