// Finishing a NEW treatment plan in the same visit: the branch switch + each plan treatment's own tick.
// Runs on the made-up clinic "Test Smile"; everything it creates or changes is put back at the end.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { call, one, all, query, loadClinic, newTestVisit, removeTestVisits, keepWorkflow } from './helpers/testApp.js';

const MARK = 'test-one-visit';
let branch, manager, restoreWorkflow, RCT, RE_RCT, NORMAL;

const workId = async (where) => Number((await one(`SELECT id FROM work_catalog WHERE tenant_id = $1 AND branch_id = $2 AND ${where} ORDER BY id LIMIT 1`, [branch.tenant_id, branch.id])).id);
const newVisit = () => newTestVisit(MARK, branch);
const complete = (apptId, works, extra = {}) => call('POST', `/api/appointments/${apptId}/completed`, manager, { works, notes: 'test one-visit', ...extra });
const sessionOf = (apptId) => one(`SELECT id FROM sessions WHERE appointment_id = $1`, [apptId]);
const plansOf = (apptId) => all(`
    SELECT DISTINCT tp.id, tp.status, tp.is_completed, tp.agreed_total, tp.total_paid, tp.is_paid
      FROM treatment_plans tp JOIN session_works sw ON sw.treatment_plan_id = tp.id JOIN sessions s ON s.id = sw.session_id
     WHERE s.appointment_id = $1 ORDER BY tp.id`, [apptId]);
const planStatus = async (id) => (await one(`SELECT status FROM treatment_plans WHERE id = $1`, [id])).status;
const setWorkflow = (extra) => call('PUT', '/api/settings/workflow', branch.manager,
    { allow_settle_unpaid: true, allow_discounts: true, max_discount_percent: 100, block_booking_if_owes: false, allow_overpay: true, ...extra });

beforeAll(async () => {
    const clinic = await loadClinic('smile.example.com');
    branch = clinic.branches[0];
    manager = clinic.manager;
    restoreWorkflow = await keepWorkflow(branch);
    RCT = await workId(`code = 'RCT'`);
    RE_RCT = await workId(`code = 'RE_RCT'`);
    NORMAL = await workId(`NOT is_plan AND NOT is_whole_mouth AND min_price > 0`);
});

afterAll(async () => {
    await query(`UPDATE work_catalog SET one_visit = true WHERE id = ANY($1::int[])`, [[RCT, RE_RCT]]);
    await restoreWorkflow();
    await removeTestVisits(MARK);
});

describe('defaults', () => {
    it('the branch switch is ON by default', async () => {
        const r = await call('GET', '/api/settings/workflow', branch.manager);
        expect(r.status).toBe(200);
        expect(r.body.data.allow_one_visit_plans).toBe(true);
    });
    it('every plan treatment is ticked by default', async () => {
        const r = await call('GET', '/api/works', manager);
        const plans = r.body.data.filter((w) => w.is_plan);
        expect(plans.length).toBeGreaterThanOrEqual(2);
        expect(plans.every((w) => w.one_visit === true)).toBe(true);
    });
});

describe('a new plan finished in the same visit', () => {
    it('is created AND closed, still owing its full price, and can be paid afterwards', async () => {
        const appt = await newVisit();
        let r = await complete(appt, [{ work_id: RCT, quantity: 1, tooth_number: null, agreed_total: 150000, finish_now: true }]);
        expect(r.status).toBe(200);
        let [plan] = await plansOf(appt);
        expect(plan).toMatchObject({ status: 'completed', is_completed: true, is_paid: false });
        expect(Number(plan.agreed_total)).toBe(150000);
        expect(Number(plan.total_paid)).toBe(0);

        const session = await sessionOf(appt);
        r = await call('POST', `/api/sessions/${session.id}/pay`, manager, { planPayments: [{ plan_id: Number(plan.id), amount: 150000 }] });
        [plan] = await plansOf(appt);
        expect(r.status).toBe(200);
        expect(Number(plan.total_paid)).toBe(150000);
        expect(plan.is_paid).toBe(true);
    });

    it('without the tick it stays open; "finished" on a CONTINUED plan does nothing; the old "Done" tick still closes it', async () => {
        let appt = await newVisit();
        let r = await complete(appt, [{ work_id: RCT, quantity: 1, tooth_number: null, agreed_total: 150000 }]);
        const [open] = await plansOf(appt);
        expect(r.status).toBe(200);
        expect(open).toMatchObject({ status: 'active', is_completed: false });

        appt = await newVisit();
        r = await complete(appt, [{ work_id: RCT, quantity: 1, tooth_number: null, treatment_plan_id: Number(open.id), finish_now: true }]);
        expect(r.status).toBe(200);
        expect(await planStatus(open.id)).toBe('active');

        appt = await newVisit();
        r = await complete(appt, [{ work_id: RCT, quantity: 1, tooth_number: null, treatment_plan_id: Number(open.id) }], { completedPlanIds: [Number(open.id)] });
        expect(r.status).toBe(200);
        expect(await planStatus(open.id)).toBe('completed');
    });
});

describe("a treatment's own tick", () => {
    it('unticked RCT is refused with PLAN_ONE_VISIT_NOT_ALLOWED and nothing is half-saved', async () => {
        let r = await call('PUT', `/api/works/${RCT}`, manager, { one_visit: false });
        expect(r.status).toBe(200);
        expect(r.body.data.one_visit).toBe(false);

        const appt = await newVisit();
        const plansBefore = Number((await one(`SELECT count(*) AS n FROM treatment_plans WHERE tenant_id = $1`, [branch.tenant_id])).n);
        r = await complete(appt, [{ work_id: NORMAL, quantity: 1, tooth_number: null }, { work_id: RCT, quantity: 1, tooth_number: null, agreed_total: 150000, finish_now: true }]);
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('PLAN_ONE_VISIT_NOT_ALLOWED');
        expect((await one(`SELECT status FROM appointments WHERE id = $1`, [appt])).status).toBe('in_progress');
        expect(await sessionOf(appt)).toBeUndefined();
        expect(Number((await one(`SELECT count(*) AS n FROM treatment_plans WHERE tenant_id = $1`, [branch.tenant_id])).n)).toBe(plansBefore);

        r = await complete(appt, [{ work_id: RE_RCT, quantity: 1, tooth_number: null, agreed_total: 150000, finish_now: true }]);
        expect(r.status).toBe(200);
        expect((await plansOf(appt))[0].status).toBe('completed');
        await call('PUT', `/api/works/${RCT}`, manager, { one_visit: true });
    });
});

describe('the branch switch off = off for every plan', () => {
    it('refuses even ticked plans, still allows the normal way, and keeps each tick', async () => {
        let r = await setWorkflow({ allow_one_visit_plans: false });
        expect(r.status).toBe(200);
        expect(r.body.data.allow_one_visit_plans).toBe(false);

        const appt = await newVisit();
        r = await complete(appt, [{ work_id: RE_RCT, quantity: 1, tooth_number: null, agreed_total: 150000, finish_now: true }]);
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('PLAN_ONE_VISIT_NOT_ALLOWED');

        r = await complete(appt, [{ work_id: RE_RCT, quantity: 1, tooth_number: null, agreed_total: 150000 }]);
        expect(r.status).toBe(200);
        expect((await plansOf(appt))[0].status).toBe('active');

        r = await call('GET', '/api/works', manager);
        expect(r.body.data.filter((w) => w.is_plan).every((w) => w.one_visit === true)).toBe(true);
    });
});

describe('the edit-visit window', () => {
    it('can add a new plan finished in the visit; refused when the switch is off and the visit stays unchanged', async () => {
        await setWorkflow({ allow_one_visit_plans: true });
        const appt = await newVisit();
        await complete(appt, [{ work_id: NORMAL, quantity: 1, tooth_number: null }]);
        const session = await sessionOf(appt);
        let r = await call('PUT', `/api/sessions/${session.id}/normal`, manager,
            { works: [{ work_id: NORMAL, quantity: 1, tooth_number: null }, { work_id: RE_RCT, quantity: 1, tooth_number: null, agreed_total: 160000, finish_now: true }] });
        expect(r.status).toBe(200);
        expect((await plansOf(appt))[0].status).toBe('completed');

        await setWorkflow({ allow_one_visit_plans: false });
        r = await call('PUT', `/api/sessions/${session.id}/normal`, manager,
            { works: [{ work_id: NORMAL, quantity: 1, tooth_number: null }, { work_id: RCT, quantity: 1, tooth_number: null, agreed_total: 150000, finish_now: true }] });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('PLAN_ONE_VISIT_NOT_ALLOWED');
        expect(await plansOf(appt)).toHaveLength(1);
    });
});

describe('bad input and permissions', () => {
    it('"finished" must be true/false', async () => {
        const appt = await newVisit();
        const r = await complete(appt, [{ work_id: RCT, quantity: 1, tooth_number: null, agreed_total: 150000, finish_now: 'yes' }]);
        expect(r.status).toBe(400);
    });
    it('reception cannot change a treatment tick or the branch switch', async () => {
        let r = await call('PUT', `/api/works/${RCT}`, branch.reception, { one_visit: false });
        expect(r.status).toBe(403);
        r = await call('PUT', '/api/settings/workflow', branch.reception, { allow_settle_unpaid: true, allow_discounts: true, max_discount_percent: 100, block_booking_if_owes: false, allow_one_visit_plans: false });
        expect(r.status).toBe(403);
    });
    it('an older screen that does not send the switch keeps the default ON', async () => {
        const r = await call('PUT', '/api/settings/workflow', branch.manager, { allow_settle_unpaid: true, allow_discounts: true, max_discount_percent: 100, block_booking_if_owes: false });
        expect(r.status).toBe(200);
        expect(r.body.data.allow_one_visit_plans).toBe(true);
    });
    it('a NEW plan treatment is ticked by default', async () => {
        const r = await call('POST', '/api/works', manager, { code: 'TEST_ONEVISIT', name: 'Test one visit', min_price: 1000, allow_installments: false, is_plan: true });
        expect(r.status).toBe(201);
        expect((await one(`SELECT one_visit FROM work_catalog WHERE id = $1`, [r.body.data.id])).one_visit).toBe(true);
        await query(`DELETE FROM work_catalog WHERE id = $1`, [r.body.data.id]);
    });
});
