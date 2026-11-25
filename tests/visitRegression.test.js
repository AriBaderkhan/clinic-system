// Regression: saving a visit, taking payments, editing a visit, plans and workflow rules keep working.
// Runs on the made-up clinic "Test Smile"; everything it creates or changes is put back at the end.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { call, one, query, loadClinic, newTestVisit, removeTestVisits, keepWorkflow } from './helpers/testApp.js';

const MARK = 'test-visit-regression';
const WF = { allow_settle_unpaid: true, allow_discounts: true, max_discount_percent: 100, block_booking_if_owes: false, allow_overpay: true, allow_one_visit_plans: true };
let branch, manager, restoreWorkflow, RCT, NORMAL, price;

const sessionRow = (id) => one(`SELECT total, total_paid, is_paid FROM sessions WHERE id = $1`, [id]);
const visit = async (works) => {
    const appt = await newTestVisit(MARK, branch);
    const r = await call('POST', `/api/appointments/${appt}/completed`, manager, { works, notes: 'test regression' });
    const session = await one(`SELECT id, total, total_paid, is_paid FROM sessions WHERE appointment_id = $1`, [appt]);
    return { r, session };
};
const pay = (sessionId, body) => call('POST', `/api/sessions/${sessionId}/pay`, manager, body);
const normal = (quantity = 1, extra = {}) => ({ work_id: NORMAL.id, quantity, tooth_number: null, ...extra });

beforeAll(async () => {
    const clinic = await loadClinic('smile.example.com');
    branch = clinic.branches[0];
    manager = clinic.manager;
    restoreWorkflow = await keepWorkflow(branch);
    const work = (where) => one(`SELECT id, name, min_price FROM work_catalog WHERE tenant_id = $1 AND branch_id = $2 AND is_active AND ${where} ORDER BY id LIMIT 1`, [branch.tenant_id, branch.id]);
    RCT = await work(`code = 'RCT'`);
    NORMAL = await work(`NOT is_plan AND NOT is_whole_mouth AND min_price > 0`);
    price = Number(NORMAL.min_price);
});

afterAll(async () => {
    await restoreWorkflow();
    await removeTestVisits(MARK);
});

describe('visit + payments', () => {
    it('a normal visit is saved with the right total, unpaid; paying the full amount marks it paid', async () => {
        const { r, session } = await visit([normal(2)]);
        expect(r.status).toBe(200);
        expect(Number(session.total)).toBe(2 * price);
        expect(session.is_paid).toBe(false);

        const p = await pay(session.id, { normalAmount: 2 * price });
        const after = await sessionRow(session.id);
        expect(p.status).toBe(200);
        expect(Number(after.total_paid)).toBe(2 * price);
        expect(after.is_paid).toBe(true);
    });

    it('paying MORE than owed is allowed while the overpay rule is on (default)', async () => {
        const { session } = await visit([normal()]);
        expect((await pay(session.id, { normalAmount: price + 5000 })).status).toBe(200);
    });

    it('overpay switched off -> refused with PAYMENT_EXCEEDS_REMAINING; paying part + "settle" closes the visit', async () => {
        await call('PUT', '/api/settings/workflow', branch.manager, { ...WF, allow_overpay: false });
        const { session } = await visit([normal()]);
        const refused = await pay(session.id, { normalAmount: price + 5000 });
        expect(refused.status).toBe(400);
        expect(refused.body.code).toBe('PAYMENT_EXCEEDS_REMAINING');

        await call('PUT', '/api/settings/workflow', branch.manager, WF);
        const settled = await pay(session.id, { normalAmount: 1000, settleNormal: true });
        expect(settled.status).toBe(200);
        expect((await sessionRow(session.id)).is_paid).toBe(true);
    });
});

describe('editing a visit', () => {
    it('x3 at a higher price updates the total; below the minimum price is refused', async () => {
        const { session } = await visit([normal()]);
        let r = await call('PUT', `/api/sessions/${session.id}/normal`, manager, { works: [normal(3, { unit_price: price + 1000 })] });
        expect(r.status).toBe(200);
        expect(Number((await sessionRow(session.id)).total)).toBe(3 * (price + 1000));

        r = await call('PUT', `/api/sessions/${session.id}/normal`, manager, { works: [normal(1, { unit_price: price - 1 })] });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('WORK_PRICE_BELOW_MIN');
    });
});

describe('treatment plans', () => {
    it('a new RCT plan starts open with its agreed price and does not add to the visit total', async () => {
        const { r, session } = await visit([{ work_id: RCT.id, quantity: 1, tooth_number: null, agreed_total: 200000 }]);
        const plan = await one(`SELECT tp.id, tp.status, tp.agreed_total FROM treatment_plans tp JOIN session_works sw ON sw.treatment_plan_id = tp.id WHERE sw.session_id = $1`, [session.id]);
        expect(r.status).toBe(200);
        expect(plan.status).toBe('active');
        expect(Number(plan.agreed_total)).toBe(200000);
        expect(Number(session.total)).toBe(0);

        // continue it on the next visit and pay part
        const next = await visit([{ work_id: RCT.id, quantity: 1, tooth_number: null, treatment_plan_id: Number(plan.id) }]);
        const p = await pay(next.session.id, { planPayments: [{ plan_id: Number(plan.id), amount: 50000 }] });
        const after = await one(`SELECT status, total_paid, is_paid FROM treatment_plans WHERE id = $1`, [plan.id]);
        expect(next.r.status).toBe(200);
        expect(p.status).toBe(200);
        expect(after).toMatchObject({ status: 'active', is_paid: false });
        expect(Number(after.total_paid)).toBe(50000);

        // a plan payment above what the plan still owes is refused (plans keep their limit)
        expect((await pay(next.session.id, { planPayments: [{ plan_id: Number(plan.id), amount: 200000 }] })).status).toBe(400);
    });
});

describe('works + workflow', () => {
    it("the doctor's treatment list still loads, with the plans", async () => {
        const r = await call('GET', `/api/works/doctor/${branch.doctors[0].id}`, manager);
        const list = r.body?.data?.works || r.body?.data || [];
        expect(r.status).toBe(200);
        expect(list.some((w) => Number(w.id) === Number(RCT.id))).toBe(true);
    });

    it("editing only a treatment's name changes nothing else", async () => {
        const before = await one(`SELECT name, one_visit, min_price FROM work_catalog WHERE id = $1`, [NORMAL.id]);
        const r = await call('PUT', `/api/works/${NORMAL.id}`, manager, { name: `${before.name} QA` });
        const after = await one(`SELECT name, one_visit, min_price FROM work_catalog WHERE id = $1`, [NORMAL.id]);
        await query(`UPDATE work_catalog SET name = $1 WHERE id = $2`, [before.name, NORMAL.id]);
        expect(r.status).toBe(200);
        expect(after).toEqual({ ...before, name: `${before.name} QA` });
    });

    it('every workflow switch saves its own value', async () => {
        const r = await call('PUT', '/api/settings/workflow', branch.manager,
            { allow_settle_unpaid: false, allow_discounts: false, max_discount_percent: 7, block_booking_if_owes: true, allow_overpay: false, allow_one_visit_plans: false });
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ allow_settle_unpaid: false, allow_discounts: false, max_discount_percent: 7, block_booking_if_owes: true, allow_overpay: false, allow_one_visit_plans: false });
    });
});
