// FINAL CLEANUP (2026-11-24): the small items saved from every part. Made-up data only; everything made is removed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../main.js';
import { call, one, all, query, loadClinic, newTestVisit, removeTestVisits } from './helpers/testApp.js';

const MARK = 'test-cleanup';
const N = Number;
const ADMIN = { id: 8, tenant_id: null, branch_id: null };
let smile, care, S1, boss;

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    care = await loadClinic('care.example.com');
    S1 = smile.branches[0];
    boss = smile.managerIn(S1.id);
});
afterAll(async () => {
    await removeTestVisits(MARK);
    await query(`DELETE FROM monthly_expenses WHERE type = $1`, [MARK]);
    await query(`DELETE FROM plans WHERE name = $1`, [MARK]);
    await query(`DELETE FROM patients WHERE name = $1 AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = patients.id)`, [MARK]);
});

describe('"not yours / missing" answers 404 (was 200 with empty data)', () => {
    it('a plan\'s visits: other clinic, other branch, missing -> 404 PLAN_NOT_FOUND; own plan still works', async () => {
        const carePlan = await one(`SELECT id FROM treatment_plans WHERE tenant_id = $1 AND NOT is_deleted LIMIT 1`, [care.tenant_id]);
        const otherBranch = await one(`SELECT id FROM treatment_plans WHERE branch_id = $1 AND NOT is_deleted LIMIT 1`, [smile.branches[1].id]);
        for (const id of [carePlan.id, otherBranch.id, 999999999]) {
            const r = await call('GET', `/api/treatment-plans/${id}/sessions`, S1.manager);
            expect([r.status, r.body.code]).toEqual([404, 'PLAN_NOT_FOUND']);
        }
        const own = await one(`SELECT id FROM treatment_plans WHERE branch_id = $1 AND NOT is_deleted LIMIT 1`, [S1.id]);
        expect((await call('GET', `/api/treatment-plans/${own.id}/sessions`, S1.manager)).status).toBe(200);
    });

    it('branch details: other clinic / missing -> 404 BRANCH_NOT_FOUND; own branch still works', async () => {
        for (const id of [care.branches[0].id, 999999999]) {
            const r = await call('GET', `/api/branches/${id}`, smile.manager);
            expect([r.status, r.body.code]).toEqual([404, 'BRANCH_NOT_FOUND']);
        }
        expect((await call('GET', `/api/branches/${S1.id}`, smile.manager)).body.data.name).toBeTruthy();
    });
});

describe('every input check answers with a code the screen can use', () => {
    it('wrong input on many different forms -> 400 VALIDATION_ERROR (JSON, with the exact message)', async () => {
        const cases = [
            ['POST', '/api/appointments', S1.reception, { patient_id: 'x' }],
            ['POST', '/api/patients', S1.reception, { name: 'x' }],
            ['POST', '/api/labs', boss, { name: '' }],
            ['POST', '/api/discounts', boss, { name: 'x', type: 'percent', value: 500 }],
            ['PUT', '/api/reminders/template', boss, { kur_msg: '' }],
            ['PUT', '/api/feedbacks/template', boss, { kur_msg: '' }],
            ['GET', '/api/patients/abc', S1.reception],
            ['GET', '/api/treatment-plans/active', boss],
        ];
        for (const [m, p, u, b] of cases) {
            const r = await call(m, p, u, b);
            expect([p, r.status, r.body.code, typeof r.body.message]).toEqual([p, 400, 'VALIDATION_ERROR', 'string']);
        }
    });

    it('reminder / feedback templates: up to 2000 letters', async () => {
        const long = 'x'.repeat(2001);
        expect((await call('PUT', '/api/reminders/template', boss, { kur_msg: long, arb_msg: 'a', eng_msg: 'e' })).status).toBe(400);
        expect((await call('PUT', '/api/feedbacks/template', boss, { kur_msg: long, arb_msg: 'a', eng_msg: 'e' })).status).toBe(400);
    });

    it('lab list: a search text over 100 letters -> 400; normal list / search still work', async () => {
        expect((await call('GET', `/api/labs?q=${'y'.repeat(101)}`, boss)).status).toBe(400);
        expect((await call('GET', '/api/labs?page=1&limit=20', boss)).status).toBe(200);
        expect((await call('GET', '/api/labs/search?q=a', boss)).status).toBe(200);
    });
});

describe('payments: one answer shape', () => {
    it('"nothing due" answers in the same shape as a payment (visit totals + plans)', async () => {
        // a fresh patient (no plans), one filling, paid in full -> then an empty pay = nothing due
        const p = await one(`INSERT INTO patients (name, phone, age, tenant_id, branch_id) VALUES ($1, '07509990001', 30, $2, $3) RETURNING id`, [MARK, smile.tenant_id, S1.id]);
        const appt = await newTestVisit(MARK, S1, { patient_id: N(p.id) });
        const work = await one(`SELECT id FROM work_catalog WHERE branch_id = $1 AND code = 'FILLING'`, [S1.id]);
        await call('POST', `/api/appointments/${appt}/completed`, boss, { works: [{ work_id: N(work.id), quantity: 1, tooth_number: 11 }] });
        const s = await one(`SELECT id, total FROM sessions WHERE appointment_id = $1`, [appt]);
        expect((await call('POST', `/api/sessions/${s.id}/pay`, S1.reception, { normalAmount: N(s.total) })).status).toBe(200);
        const r = await call('POST', `/api/sessions/${s.id}/pay`, S1.reception, {});
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ session: { session_id: expect.anything(), totals: { total: N(s.total), total_paid: N(s.total), is_paid: true } }, treatment_plans: [] });
    });
});

describe('expenses and plans', () => {
    it('deleting the same expense twice: the second answers 404 EXPENSE_NOT_FOUND', async () => {
        const c = await call('POST', '/api/monthly-expenses', boss, { type: MARK, amount: 1000, expense_date: '2026-11-20' });
        const id = c.body.data.id;
        expect((await call('DELETE', `/api/monthly-expenses/${id}`, boss)).status).toBe(200);
        const again = await call('DELETE', `/api/monthly-expenses/${id}`, boss);
        expect([again.status, again.body.code]).toEqual([404, 'EXPENSE_NOT_FOUND']);
        expect((await call('GET', `/api/monthly-expenses/${id}`, boss)).body.code).toBe('EXPENSE_NOT_FOUND');
    });

    it('a platform plan used by clinics can\'t be deleted (409 PLAN_IN_USE); an unused one can', async () => {
        const used = await call('DELETE', '/api/plans/2', ADMIN);
        expect([used.status, used.body.code]).toEqual([409, 'PLAN_IN_USE']);
        expect(await one(`SELECT id FROM plans WHERE id = 2`)).toBeTruthy();
        const p = await one(`INSERT INTO plans (name, max_branches, max_users, price, yearly_price, included_doctors, extra_doctor_price, extra_doctor_yearly_price, sort_order) VALUES ($1, 1, -1, 1, 12, 1, -1, -1, 99) RETURNING id`, [MARK]);
        expect((await call('DELETE', `/api/plans/${p.id}`, ADMIN)).status).toBe(200);
    });

    it('the admin\'s subscription status must be a short word', async () => {
        const sub = await one(`SELECT id, status FROM subscriptions WHERE tenant_id = $1`, [smile.tenant_id]);
        const r = await call('PUT', `/api/subscriptions/${sub.id}/tenant/${smile.tenant_id}`, ADMIN, { status: 'Active; DROP' });
        expect([r.status, r.body.code]).toEqual([400, 'VALIDATION_ERROR']);
    });
});

describe('announcements', () => {
    it('an announcement takes ONE image (more -> 400)', async () => {
        const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
        const jwt = (await import('jsonwebtoken')).default;
        const token = jwt.sign(ADMIN, process.env.JWT_SECRET, { expiresIn: '10m' });
        const r = await request(app).post('/api/announcements').set('Authorization', `Bearer ${token}`).field('title', MARK)
            .attach('images', PNG, { filename: 'a.png', contentType: 'image/png' }).attach('images', PNG, { filename: 'b.png', contentType: 'image/png' });
        expect(r.status).toBe(400);
        expect(N((await one(`SELECT count(*) n FROM announcements WHERE title = $1`, [MARK])).n)).toBe(0);
    });
});

describe('"most / least done" with a tie is always the same answer', () => {
    it('the same report twice gives the same most / least names', async () => {
        const get = async () => (await call('GET', '/api/reports/insights/treatments_least?month=2026-11-01', smile.manager)).body.data.result.branches.map((b) => b.breakdown.map((x) => x.label));
        const a = await get();
        for (let i = 0; i < 5; i++) expect(await get()).toEqual(a);
    });
});
