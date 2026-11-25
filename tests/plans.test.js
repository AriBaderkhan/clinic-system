// PART 6 — Treatment plan money.  REPORT MODE: tests marked show a problem (no app code changed).
// Every test builds its own plans on fresh visits of "Test Smile" branch 1 and cleans them up.
// Owner's rule (2026-08-17): a plan may be marked finished while it still owes money — that is NOT a bug.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { call, one, all, query, loadClinic, newTestVisit, removeTestVisits, keepWorkflow } from './helpers/testApp.js';

const MARK = 'test-plans';
const startedAt = new Date();
let smile, S1, boss, restore, work = {}, patients = [];
const N = Number;

const plan = async (id) => {
    const p = await one(`SELECT agreed_total, total_paid, is_paid, is_completed, status, is_deleted, type FROM treatment_plans WHERE id = $1`, [id]);
    return { ...p, agreed: N(p.agreed_total), paid: N(p.total_paid) };
};
const sessionOf = async (appt) => N((await one(`SELECT id FROM sessions WHERE appointment_id = $1`, [appt])).id);
// a finished visit for a patient; `items` like [{ code: 'RCT', agreed: 200000 }] or [{ code: 'RCT', plan: id }] or [{ code: 'FILLING' }]
async function visit(patient, items, extra = {}) {
    const appt = await newTestVisit(MARK, S1, { patient_id: patient });
    const works = items.map((i) => ({
        work_id: work[i.code], quantity: 1, tooth_number: 16,
        ...(i.agreed !== undefined ? { agreed_total: i.agreed } : {}), ...(i.plan ? { treatment_plan_id: i.plan } : {}),
    }));
    const r = await call('POST', `/api/appointments/${appt}/completed`, boss, { works, ...extra });
    return { r, appt, session: r.status === 200 ? await sessionOf(appt) : null };
}
const newPlan = async (patient, code = 'RCT', agreed = 200000) => {
    const v = await visit(patient, [{ code, agreed }]);
    if (v.r.status !== 200) throw new Error('plan setup: ' + JSON.stringify(v.r.body));
    const id = N((await one(`SELECT treatment_plan_id AS id FROM session_works WHERE session_id = $1 AND treatment_plan_id IS NOT NULL`, [v.session])).id);
    return { id, ...v };
};
const payPlan = (session, plan_id, amount, more = {}) => call('POST', `/api/sessions/${session}/pay`, boss, { planPayments: [{ plan_id, amount }], ...more });
const livePayments = (planId) => all(`SELECT id, amount, session_id FROM treatment_payments WHERE treatment_plan_id = $1 AND is_deleted = false ORDER BY id`, [planId]);

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    S1 = smile.branches[0];
    boss = smile.manager;
    restore = await keepWorkflow(S1);
    await call('PUT', '/api/settings/workflow', S1.manager, { allow_settle_unpaid: true, allow_discounts: true, max_discount_percent: 100, block_booking_if_owes: false, allow_overpay: true, allow_one_visit_plans: true });
    work = Object.fromEntries((await all(`SELECT code, id FROM work_catalog WHERE branch_id = $1`, [S1.id])).map((w) => [w.code, N(w.id)]));
    patients = (await all(`SELECT id FROM patients WHERE branch_id = $1 ORDER BY id LIMIT 3`, [S1.id])).map((p) => N(p.id));
}, 60000);

afterAll(async () => {
    await restore();
    await removeTestVisits(MARK);
    await query(`DELETE FROM audit_logs WHERE tenant_id = $1 AND created_at >= $2`, [smile.tenant_id, startedAt]);
});

describe('starting and continuing a plan', () => {
    it('a new plan starts open with its agreed price, nothing paid, and does not add to the visit bill', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        expect(await plan(p.id)).toMatchObject({ agreed: 200000, paid: 0, is_paid: false, status: 'active', type: 'rct' });
        expect(N((await one(`SELECT total FROM sessions WHERE id = $1`, [p.session])).total)).toBe(0);
    });

    it('agreed price missing, 0, or below the treatment minimum is refused and nothing is saved', async () => {
        const plansBefore = N((await one(`SELECT count(*) AS n FROM treatment_plans WHERE patient_id = $1`, [patients[0]])).n);
        for (const [agreed, code] of [[undefined, 'AGREEMENT_TOTAL_REQUIRED'], [0, 'AGREEMENT_TOTAL_REQUIRED'], [119999, 'AGREEMENT_TOTAL_BELOW_MIN']]) {
            const v = await visit(patients[0], [{ code: 'RCT', agreed }]);
            expect(v.r.body.code, String(agreed)).toBe(code);
            expect((await one(`SELECT status FROM appointments WHERE id = $1`, [v.appt])).status).toBe('in_progress');
        }
        expect(N((await one(`SELECT count(*) AS n FROM treatment_plans WHERE patient_id = $1`, [patients[0]])).n)).toBe(plansBefore);
    });

    it('continuing: another patient\'s plan, the wrong type, or a finished plan is refused', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        expect((await visit(patients[1], [{ code: 'RCT', plan: p.id }])).r.body.code).toBe('PLAN_PATIENT_MISMATCH');
        expect((await visit(patients[0], [{ code: 'RE_RCT', plan: p.id }])).r.body.code).toBe('PLAN_TYPE_MISMATCH');
        await call('PATCH', `/api/treatment-plans/${p.id}`, boss, { is_completed: true });
        expect((await visit(patients[0], [{ code: 'RCT', plan: p.id }])).r.body.code).toBe('PLAN_NOT_ACTIVE');
    });
});

describe('paying a plan', () => {
    it('part, then the rest: open, then paid; never above the agreed price (exact rest OK, 1 more refused)', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        expect((await payPlan(p.session, p.id, 50000)).status).toBe(200);
        expect(await plan(p.id)).toMatchObject({ paid: 50000, is_paid: false });
        const over = await payPlan(p.session, p.id, 150001);
        expect(over.body.code).toBe('AMOUNT_EXCEEDS_REMAINING');
        expect((await payPlan(p.session, p.id, 150000)).status).toBe(200);
        expect(await plan(p.id)).toMatchObject({ paid: 200000, is_paid: true });
    });

    it('a plan can only be paid from a visit where it has a treatment', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        const other = await visit(patients[0], [{ code: 'FILLING' }]);
        expect((await payPlan(other.session, p.id, 1000)).body.code).toBe('PLAN_NOT_IN_SESSION');
    });

    it('a FINISHED plan that still owes money can still be paid (owner\'s rule)', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        await call('PATCH', `/api/treatment-plans/${p.id}`, boss, { is_completed: true });
        expect((await payPlan(p.session, p.id, 200000)).status).toBe(200);
        expect(await plan(p.id)).toMatchObject({ status: 'completed', is_paid: true });
    });

    it('plan + visit payment in one request: if the plan part is refused, the visit part is NOT saved either', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        const v = await visit(patients[0], [{ code: 'FILLING' }, { code: 'RCT', plan: p.id }]);
        const r = await call('POST', `/api/sessions/${v.session}/pay`, boss, { normalAmount: 40000, planPayments: [{ plan_id: p.id, amount: 999999 }] });
        expect(r.body.code).toBe('AMOUNT_EXCEEDS_REMAINING');
        expect(N((await one(`SELECT total_paid FROM sessions WHERE id = $1`, [v.session])).total_paid)).toBe(0);
        expect(await all(`SELECT id FROM session_payments WHERE session_id = $1`, [v.session])).toHaveLength(0);
    });

    it('two payments of the whole remaining at the same moment: only ONE is saved (the plan row is locked)', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        const results = await Promise.all([payPlan(p.session, p.id, 200000), call('POST', `/api/sessions/${p.session}/pay`, S1.reception, { planPayments: [{ plan_id: p.id, amount: 200000 }] })]);
        expect(results.filter((r) => r.status === 200)).toHaveLength(1);
        expect((await plan(p.id)).paid).toBe(200000);
    });

    it('plan payments keep the branch currency and who took them', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        await payPlan(p.session, p.id, 10000);
        const row = await one(`SELECT currency_code, created_by FROM treatment_payments WHERE treatment_plan_id = $1`, [p.id]);
        expect(row).toMatchObject({ currency_code: 'IQD' });
        expect(N(row.created_by)).toBe(boss.id);
    });
});

describe('editing a plan and its payments', () => {
    it('raising the agreed price re-opens a paid plan; lowering below what was paid is refused; exactly the paid amount closes it', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        await payPlan(p.session, p.id, 200000);
        expect((await call('PATCH', `/api/treatment-plans/${p.id}`, boss, { agreed_total: 250000 })).status).toBe(200);
        expect(await plan(p.id)).toMatchObject({ agreed: 250000, is_paid: false });
        expect((await call('PATCH', `/api/treatment-plans/${p.id}`, boss, { agreed_total: 199999 })).body.code).toBe('AGREED_BELOW_PAID');
        expect((await call('PATCH', `/api/treatment-plans/${p.id}`, boss, { agreed_total: 200000 })).status).toBe(200);
        expect(await plan(p.id)).toMatchObject({ agreed: 200000, is_paid: true });
    });

    it('editing a plan cannot set an agreed price below the treatment minimum (same rule as when it is created)', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000); // RCT minimum is 120,000
        const r = await call('PATCH', `/api/treatment-plans/${p.id}`, boss, { agreed_total: 1000 });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('AGREEMENT_TOTAL_BELOW_MIN');
        expect((await plan(p.id)).agreed).toBe(200000);
        // exactly the minimum is fine
        expect((await call('PATCH', `/api/treatment-plans/${p.id}`, boss, { agreed_total: 120000 })).status).toBe(200);
    });

    it("editing other things (finished tick) of an OLD plan whose price is below today's minimum still works", async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        await query(`UPDATE treatment_plans SET agreed_total = 100000 WHERE id = $1`, [p.id]); // like an old plan from before a price rise
        expect((await call('PATCH', `/api/treatment-plans/${p.id}`, boss, { is_completed: true })).status).toBe(200);
    });

    it('the answer of a plan edit has the same shape as before (just the plan)', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        const r = await call('PATCH', `/api/treatment-plans/${p.id}`, boss, { agreed_total: 210000 });
        expect(r.body).toMatchObject({ ok: true, data: { id: expect.anything(), agreed_total: expect.anything() } });
        expect(r.body.data).not.toHaveProperty('before');
        expect(r.body.data).not.toHaveProperty('plan');
    });

    it('editing a plan\'s agreed price keeps the OLD price in the activity log', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        await call('PATCH', `/api/treatment-plans/${p.id}`, boss, { agreed_total: 230000 });
        await new Promise((r) => setTimeout(r, 300));
        const row = await one(`SELECT details FROM audit_logs WHERE path = $1 ORDER BY id DESC LIMIT 1`, [`/api/treatment-plans/${p.id}`]);
        expect(row?.details).toMatchObject({ old_agreed_total: 200000, new_agreed_total: 230000, old_type: 'rct', new_type: 'rct' });
    });

    it('editing a plan payment: raising above the agreed price is refused and NOTHING changes; lowering re-counts', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        await payPlan(p.session, p.id, 150000);
        const [pay] = await livePayments(p.id);
        const r = await call('PATCH', `/api/sessions/${p.session}/plan-payments/${pay.id}`, boss, { amount: 200001 });
        expect(r.body.code).toBe('AMOUNT_EXCEEDS_REMAINING');
        expect((await plan(p.id)).paid).toBe(150000);
        expect(N((await one(`SELECT amount FROM treatment_payments WHERE id = $1`, [pay.id])).amount)).toBe(150000);
        expect((await call('PATCH', `/api/sessions/${p.session}/plan-payments/${pay.id}`, boss, { amount: 100000 })).status).toBe(200);
        expect((await plan(p.id)).paid).toBe(100000);
    });

    it('deleting a plan payment keeps it (marked deleted) and re-counts the plan', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        await payPlan(p.session, p.id, 200000);
        const [pay] = await livePayments(p.id);
        expect((await call('DELETE', `/api/sessions/${p.session}/plan-payments/${pay.id}`, boss)).status).toBe(200);
        expect(await plan(p.id)).toMatchObject({ paid: 0, is_paid: false });
        expect((await one(`SELECT is_deleted FROM treatment_payments WHERE id = $1`, [pay.id])).is_deleted).toBe(true);
    });

    it('"set paid in this visit": 0 removes it, above the agreed price is refused, bad numbers are refused', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        const set = (amount) => call('PATCH', `/api/treatment-plans/${p.id}/sessions/${p.session}/paid`, boss, { amount });
        expect((await set(80000)).status).toBe(200);
        expect((await plan(p.id)).paid).toBe(80000);
        expect((await set(200001)).body.code).toBe('AMOUNT_EXCEEDS_REMAINING');
        expect((await plan(p.id)).paid).toBe(80000);
        for (const bad of [-1, 'abc', null]) expect((await set(bad)).status, String(bad)).toBe(400);
        expect((await set(0)).status).toBe(200);
        expect((await plan(p.id)).paid).toBe(0);
    });
});

describe('voiding (deleting) a plan', () => {
    it('the plan, its treatments and its payments are all marked deleted; it leaves the lists; voiding again answers 404', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        await payPlan(p.session, p.id, 50000);
        expect((await call('DELETE', `/api/treatment-plans/${p.id}`, boss)).status).toBe(200);
        expect((await plan(p.id)).is_deleted).toBe(true);
        expect(await livePayments(p.id)).toHaveLength(0);
        expect(await all(`SELECT id FROM session_works WHERE treatment_plan_id = $1 AND is_deleted = false`, [p.id])).toHaveLength(0);
        const list = await call('GET', '/api/treatment-plans?limit=100', boss);
        expect(list.body.data.some((x) => N(x.id) === p.id)).toBe(false);
        expect((await call('DELETE', `/api/treatment-plans/${p.id}`, boss)).status).toBe(404);
    });
});

describe('plan treatments inside a visit', () => {
    it('the last plan treatment of a visit that still has payments for it cannot be removed; after removing the payments it can, and the empty plan disappears', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        await payPlan(p.session, p.id, 30000);
        const sw = N((await one(`SELECT id FROM session_works WHERE session_id = $1 AND treatment_plan_id = $2`, [p.session, p.id])).id);
        expect((await call('DELETE', `/api/sessions/${p.session}/plan-works/${sw}`, boss)).body.code).toBe('PLAN_WORK_HAS_PAYMENTS');
        const [pay] = await livePayments(p.id);
        await call('DELETE', `/api/sessions/${p.session}/plan-payments/${pay.id}`, boss);
        const r = await call('DELETE', `/api/sessions/${p.session}/plan-works/${sw}`, boss);
        expect(r.status).toBe(200);
        expect(N(r.body.data.removed_plan_id)).toBe(p.id);
        expect((await plan(p.id)).is_deleted).toBe(true);
    });

    it('moving a treatment to another plan of the same patient moves the visit\'s payments with it and re-counts both plans', async () => {
        const a = await newPlan(patients[0], 'RCT', 200000);
        const b = await newPlan(patients[0], 'RCT', 300000);
        await payPlan(a.session, a.id, 40000);
        const sw = N((await one(`SELECT id FROM session_works WHERE session_id = $1 AND treatment_plan_id = $2`, [a.session, a.id])).id);
        const r = await call('PATCH', `/api/sessions/${a.session}/plan-works/${sw}/plan`, boss, { treatment_plan_id: b.id });
        expect(r.status).toBe(200);
        expect((await plan(b.id)).paid).toBe(40000);
        expect((await plan(a.id)).is_deleted).toBe(true); // nothing left in the old plan
    });

    it('moving is refused to another patient\'s plan, and refused (nothing changes) when the target plan would be overpaid', async () => {
        const a = await newPlan(patients[0], 'RCT', 200000);
        const small = await newPlan(patients[0], 'RCT', 130000);
        const stranger = await newPlan(patients[1], 'RCT', 200000);
        await payPlan(small.session, small.id, 130000);
        await payPlan(a.session, a.id, 50000);
        const sw = N((await one(`SELECT id FROM session_works WHERE session_id = $1 AND treatment_plan_id = $2`, [a.session, a.id])).id);
        expect((await call('PATCH', `/api/sessions/${a.session}/plan-works/${sw}/plan`, boss, { treatment_plan_id: stranger.id })).body.code).toBe('PLAN_PATIENT_MISMATCH');
        const r = await call('PATCH', `/api/sessions/${a.session}/plan-works/${sw}/plan`, boss, { treatment_plan_id: small.id });
        expect(r.body.code).toBe('AMOUNT_EXCEEDS_REMAINING');
        expect((await plan(a.id)).paid).toBe(50000);
        expect((await plan(small.id)).paid).toBe(130000);
    });
});

describe('finishing a plan', () => {
    it('the "Done" tick when finishing a visit closes the plan; status and the finished flag always agree', async () => {
        const p = await newPlan(patients[0], 'RCT', 200000);
        const v = await visit(patients[0], [{ code: 'RCT', plan: p.id }], { completedPlanIds: [p.id] });
        expect(v.r.status).toBe(200);
        expect(await plan(p.id)).toMatchObject({ status: 'completed', is_completed: true });
        await call('PATCH', `/api/treatment-plans/${p.id}`, boss, { is_completed: false });
        expect(await plan(p.id)).toMatchObject({ status: 'active', is_completed: false });
    });
});

describe('plan money adds up across ALL the data', () => {
    it('made-up clinics: every live plan\'s paid = its live payments, "paid" flag right, never above the agreed price, nothing live hangs on a deleted plan', async () => {
        const t = [smile.tenant_id, (await loadClinic('care.example.com')).tenant_id];
        const bad = await one(`
            SELECT
              (SELECT count(*) FROM treatment_plans tp WHERE tp.tenant_id = ANY($1) AND tp.is_deleted = false AND tp.total_paid <>
                 (SELECT COALESCE(sum(amount), 0) FROM treatment_payments x WHERE x.treatment_plan_id = tp.id AND x.is_deleted = false)) AS paid_mismatch,
              (SELECT count(*) FROM treatment_plans WHERE tenant_id = ANY($1) AND is_deleted = false AND is_paid <> (total_paid >= agreed_total)) AS flag_wrong,
              (SELECT count(*) FROM treatment_plans WHERE tenant_id = ANY($1) AND is_deleted = false AND total_paid > agreed_total) AS overpaid,
              (SELECT count(*) FROM treatment_payments x JOIN treatment_plans tp ON tp.id = x.treatment_plan_id WHERE tp.tenant_id = ANY($1) AND tp.is_deleted AND NOT x.is_deleted) AS live_pay_on_deleted,
              (SELECT count(*) FROM session_works w JOIN treatment_plans tp ON tp.id = w.treatment_plan_id WHERE tp.tenant_id = ANY($1) AND tp.is_deleted AND NOT w.is_deleted) AS live_work_on_deleted,
              (SELECT count(*) FROM treatment_plans WHERE tenant_id = ANY($1) AND (status = 'completed') <> is_completed) AS status_flag_disagree`, [t]);
        expect(Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, N(v)]))).toEqual({ paid_mismatch: 0, flag_wrong: 0, overpaid: 0, live_pay_on_deleted: 0, live_work_on_deleted: 0, status_flag_disagree: 0 });
    });
});
