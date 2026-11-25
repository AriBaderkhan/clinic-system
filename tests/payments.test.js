// PART 5 — Visit payments + discounts.  REPORT MODE: tests marked show a problem (no app code changed).
// Every test makes its own fresh visit with a known total on "Test Smile" branch 1 (IQD) or "Test Care" Kirkuk (USD),
// and puts every rule switch back afterwards.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { call, one, all, query, loadClinic, newTestVisit, removeTestVisits, keepWorkflow } from './helpers/testApp.js';

const MARK = 'test-payments';
const startedAt = new Date();
let smile, care, S1, USD, boss, usdBoss, restoreS1, restoreUSD, work = {}, discounts = {};
const N = Number;

// a finished visit with exactly these treatments (code -> quantity / price) in a branch
async function visit(branch, user, items) {
    const appt = await newTestVisit(MARK, branch);
    const works = items.map(({ code, quantity = 1 }) => ({ work_id: work[branch.id][code], quantity, tooth_number: 11 }));
    const r = await call('POST', `/api/appointments/${appt}/completed`, user, { works });
    if (r.status !== 200) throw new Error('visit setup: ' + JSON.stringify(r.body));
    const s = await one(`SELECT id FROM sessions WHERE appointment_id = $1`, [appt]);
    // set custom prices when asked (the edit-visit screen allows a price above the minimum)
    if (items.some((i) => i.price)) {
        const edit = items.map(({ code, quantity = 1, price }) => ({ work_id: work[branch.id][code], quantity, tooth_number: 11, unit_price: price ?? null }));
        const e = await call('PUT', `/api/sessions/${s.id}/normal`, user, { works: edit });
        if (e.status !== 200) throw new Error('visit price setup: ' + JSON.stringify(e.body));
    }
    return { appt, id: N(s.id), ...(await money(N(s.id))) };
}
const money = async (id) => {
    const s = await one(`SELECT total, total_paid, discount_amount, is_paid, is_settled, discount_id FROM sessions WHERE id = $1`, [id]);
    return { total: N(s.total), paid: N(s.total_paid), discount: N(s.discount_amount), is_paid: s.is_paid, is_settled: s.is_settled, discount_id: s.discount_id };
};
const pay = (id, body, user = boss) => call('POST', `/api/sessions/${id}/pay`, user, body);
const setRules = (branch, user, rules) => call('PUT', '/api/settings/workflow', user,
    { allow_settle_unpaid: true, allow_discounts: true, max_discount_percent: 100, block_booking_if_owes: false, allow_overpay: true, allow_one_visit_plans: true, ...rules });
const paymentsOf = (id) => all(`SELECT id, amount, created_by, currency_code FROM session_payments WHERE session_id = $1 ORDER BY id`, [id]);

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    care = await loadClinic('care.example.com');
    S1 = smile.branches[0];
    USD = care.branches[1];
    boss = smile.manager;
    usdBoss = care.managerIn(USD.id);
    for (const b of [S1, USD]) {
        work[b.id] = Object.fromEntries((await all(`SELECT code, id FROM work_catalog WHERE branch_id = $1`, [b.id])).map((w) => [w.code, N(w.id)]));
    }
    restoreS1 = await keepWorkflow(S1);
    restoreUSD = await keepWorkflow(USD);
    // start every run from the default rules (never from what an earlier run left behind)
    await setRules(S1, S1.manager, {});
    await setRules(USD, USD.manager, {});
    const d = await all(`SELECT id, type, value, branch_id FROM discounts WHERE branch_id = ANY($1)`, [[S1.id, USD.id]]);
    for (const x of d) discounts[`${x.branch_id}:${x.type}`] = { id: N(x.id), value: N(x.value) };
}, 60000);

afterAll(async () => {
    await restoreS1();
    await restoreUSD();
    await query(`UPDATE discounts SET is_active = true WHERE branch_id = ANY($1)`, [[S1.id, USD.id]]);
    await removeTestVisits(MARK);
    await query(`DELETE FROM audit_logs WHERE tenant_id = ANY($1) AND created_at >= $2`, [[smile.tenant_id, care.tenant_id], startedAt]);
});

describe('paying a visit', () => {
    it('full payment closes the visit; the payment row keeps who took it and the branch currency', async () => {
        const v = await visit(S1, boss, [{ code: 'FILLING', quantity: 2 }]); // 2 × 40,000
        expect(v.total).toBe(80000);
        expect((await pay(v.id, { normalAmount: 80000 })).status).toBe(200);
        expect(await money(v.id)).toMatchObject({ paid: 80000, is_paid: true });
        const [p] = await paymentsOf(v.id);
        expect(N(p.created_by)).toBe(boss.id);
        expect(p.currency_code).toBe('IQD');
    });

    it('two part payments: open after the first, closed after the second; paid + remaining = total at every step', async () => {
        const v = await visit(S1, boss, [{ code: 'CROWN_PFM' }]); // 100,000
        await pay(v.id, { normalAmount: 30000 });
        let m = await money(v.id);
        expect(m).toMatchObject({ paid: 30000, is_paid: false });
        const listed = (await call('GET', '/api/sessions/unpaid', boss)).body.data.find((s) => N(s.session_id ?? s.id) === v.id);
        expect(listed && N(listed.totals.remaining)).toBe(70000);
        await pay(v.id, { normalAmount: 70000 });
        m = await money(v.id);
        expect(m).toMatchObject({ paid: 100000, is_paid: true });
        const stillListed = (await call('GET', '/api/sessions/unpaid', boss)).body.data.some((s) => N(s.session_id ?? s.id) === v.id);
        expect(stillListed).toBe(false);
    });

    it('a closed visit cannot be paid again', async () => {
        const v = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        await pay(v.id, { normalAmount: 20000 });
        const r = await pay(v.id, { normalAmount: 1000 });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('SESSION_ALREADY_PAID');
    });

    it('overpay rule: allowed by default; when switched off, exactly the remaining is OK and 1 more is refused', async () => {
        const a = await visit(S1, boss, [{ code: 'EXTRACTION' }]); // 20,000
        expect((await pay(a.id, { normalAmount: 25000 })).status).toBe(200);
        expect(await money(a.id)).toMatchObject({ paid: 25000, is_paid: true });

        await setRules(S1, S1.manager, { allow_overpay: false });
        const b = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        await pay(b.id, { normalAmount: 5000 });
        const over = await pay(b.id, { normalAmount: 15001 });
        expect(over.status).toBe(400);
        expect(over.body.code).toBe('PAYMENT_EXCEEDS_REMAINING');
        expect((await pay(b.id, { normalAmount: 15000 })).status).toBe(200);
        expect(await money(b.id)).toMatchObject({ paid: 20000, is_paid: true });
        await setRules(S1, S1.manager, {});
    });

    it('bad amounts are refused with VALIDATION_ERROR (zero, negative, text, too big)', async () => {
        const v = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        for (const amount of [0, -5000, 'abc', 1e13]) {
            const r = await pay(v.id, { normalAmount: amount });
            expect(r.status, String(amount)).toBe(400);
        }
        expect(await paymentsOf(v.id)).toHaveLength(0);
    });

    it('an amount with more than 2 decimals is stored rounded, and paid still equals the sum of the payments', async () => {
        const v = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        await pay(v.id, { normalAmount: 1000.555 });
        const rows = await paymentsOf(v.id);
        const m = await money(v.id);
        expect(rows.reduce((s, p) => s + N(p.amount), 0)).toBe(m.paid);
    });

    it('a visit that is not finished yet cannot be paid', async () => {
        const v = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        await query(`UPDATE appointments SET status = 'in_progress' WHERE id = $1`, [v.appt]);
        const r = await pay(v.id, { normalAmount: 1000 });
        await query(`UPDATE appointments SET status = 'completed' WHERE id = $1`, [v.appt]);
        expect(r.body.code).toBe('APPOINTMENT_NOT_COMPLETED');
    });

    it('asking to pay nothing while money is owed is refused', async () => {
        const v = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        const r = await pay(v.id, {});
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('NO_PAYMENT_PROVIDED');
    });

    it('"nothing due" (empty pay on a closed visit) does not leave the database locked', async () => {
        const v = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        await pay(v.id, { normalAmount: 20000 });
        const r = await pay(v.id, {});
        expect(r.status).toBe(200);
        // a separate connection tries to lock the same visit row WITHOUT waiting
        const probe = new pg.Client({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME_TEST });
        await probe.connect();
        let locked = false;
        try {
            await probe.query('BEGIN');
            await probe.query(`SELECT id FROM sessions WHERE id = $1 FOR UPDATE NOWAIT`, [v.id]);
            await probe.query('ROLLBACK');
        } catch (e) {
            locked = e.code === '55P03';
            await probe.query('ROLLBACK').catch(() => {});
        }
        // clean the leak so other tests are not blocked: end any app connection stuck "idle in transaction"
        await probe.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction' AND pid <> pg_backend_pid()`);
        await probe.end();
        expect(locked, 'the visit row is still locked by a connection that was given back to the pool mid-transaction').toBe(false);
    });
});

describe('discounts', () => {
    it('a 10% discount on 100,000 = 10,000; paying the other 90,000 closes the visit', async () => {
        const v = await visit(S1, boss, [{ code: 'CROWN_PFM' }]);
        await pay(v.id, { discountId: discounts[`${S1.id}:percent`].id });
        expect(await money(v.id)).toMatchObject({ discount: 10000, is_paid: false });
        await pay(v.id, { normalAmount: 90000 });
        expect(await money(v.id)).toMatchObject({ paid: 90000, discount: 10000, is_paid: true });
    });

    it('a discount never goes above what is still owed (fixed 10,000 when 5,000 is left -> 5,000)', async () => {
        const v = await visit(S1, boss, [{ code: 'EXTRACTION' }]); // 20,000
        await pay(v.id, { normalAmount: 15000 });
        await pay(v.id, { discountId: discounts[`${S1.id}:fixed`].id });
        expect(await money(v.id)).toMatchObject({ discount: 5000, is_paid: true });
    });

    it('discounts switched off -> DISCOUNTS_NOT_ALLOWED; a max of 5% refuses 10% and allows exactly 5%', async () => {
        const v = await visit(S1, boss, [{ code: 'CROWN_PFM' }]);
        await setRules(S1, S1.manager, { allow_discounts: false });
        let r = await pay(v.id, { discountId: discounts[`${S1.id}:percent`].id });
        expect(r.body.code).toBe('DISCOUNTS_NOT_ALLOWED');
        await setRules(S1, S1.manager, { max_discount_percent: 5 });
        r = await pay(v.id, { discountId: discounts[`${S1.id}:percent`].id });
        expect(r.body.code).toBe('DISCOUNT_OVER_MAX');
        await setRules(S1, S1.manager, { max_discount_percent: 10 });
        expect((await pay(v.id, { discountId: discounts[`${S1.id}:percent`].id })).status).toBe(200);
        await setRules(S1, S1.manager, {});
    });

    it('a switched-off discount cannot be used', async () => {
        const v = await visit(S1, boss, [{ code: 'CROWN_PFM' }]);
        await query(`UPDATE discounts SET is_active = false WHERE id = $1`, [discounts[`${S1.id}:percent`].id]);
        const r = await pay(v.id, { discountId: discounts[`${S1.id}:percent`].id });
        await query(`UPDATE discounts SET is_active = true WHERE id = $1`, [discounts[`${S1.id}:percent`].id]);
        expect(r.body.code).toBe('DISCOUNT_NOT_FOUND');
    });

    it('a second discount REPLACES the first (they never add up)', async () => {
        const v = await visit(S1, boss, [{ code: 'CROWN_PFM' }]);
        await pay(v.id, { discountId: discounts[`${S1.id}:percent`].id }); // 10,000
        await pay(v.id, { discountId: discounts[`${S1.id}:fixed`].id });   // 10,000 fixed
        const m = await money(v.id);
        expect(m.discount).toBe(10000);
        expect(N(m.discount_id)).toBe(discounts[`${S1.id}:fixed`].id);
    });

    // decided by the owner (2026-11-24): keep as is — answers OK, changes nothing (no money is ever wrong)
    it('a discount on an already-closed visit changes nothing', async () => {
        const v = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        await pay(v.id, { normalAmount: 20000 });
        await pay(v.id, { discountId: discounts[`${S1.id}:percent`].id });
        expect(await money(v.id)).toMatchObject({ paid: 20000, discount: 0, is_paid: true });
    });

    it('USD branch: 10% of $33.50 is $3.35 (cents are kept)', async () => {
        const v = await visit(USD, usdBoss, [{ code: 'FILLING', price: 33.5 }]);
        expect(v.total).toBe(33.5);
        await pay(v.id, { discountId: discounts[`${USD.id}:percent`].id }, usdBoss);
        expect((await money(v.id)).discount).toBe(3.35);
    });
});

describe('closing a visit without full payment ("settle")', () => {
    it('settle closes a part-paid visit and it leaves the unpaid list; switched off -> SETTLE_NOT_ALLOWED', async () => {
        const v = await visit(S1, boss, [{ code: 'CROWN_PFM' }]);
        await setRules(S1, S1.manager, { allow_settle_unpaid: false });
        let r = await pay(v.id, { normalAmount: 60000, settleNormal: true });
        expect(r.body.code).toBe('SETTLE_NOT_ALLOWED');
        expect(await paymentsOf(v.id)).toHaveLength(0); // the payment in the same request was NOT half-saved
        await setRules(S1, S1.manager, {});
        r = await pay(v.id, { normalAmount: 60000, settleNormal: true });
        expect(await money(v.id)).toMatchObject({ paid: 60000, is_paid: true, is_settled: true });
        const listed = (await call('GET', '/api/sessions/unpaid', boss)).body.data.some((s) => N(s.session_id ?? s.id) === v.id);
        expect(listed).toBe(false);
    });

    it('a settled visit stays closed after its payment is edited down', async () => {
        const v = await visit(S1, boss, [{ code: 'CROWN_PFM' }]);
        await pay(v.id, { normalAmount: 60000, settleNormal: true });
        const [p] = await paymentsOf(v.id);
        await call('PATCH', `/api/sessions/${v.id}/payments/${p.id}`, boss, { amount: 50000 });
        expect(await money(v.id)).toMatchObject({ paid: 50000, is_paid: true, is_settled: true });
    });
});

describe('editing and deleting a payment', () => {
    it('editing a payment re-counts the visit; overpay off refuses raising above the bill but lowering always works', async () => {
        const v = await visit(S1, boss, [{ code: 'CROWN_PFM' }]);
        await pay(v.id, { normalAmount: 100000 });
        const [p] = await paymentsOf(v.id);
        let r = await call('PATCH', `/api/sessions/${v.id}/payments/${p.id}`, boss, { amount: 70000 });
        expect(r.status).toBe(200);
        expect(await money(v.id)).toMatchObject({ paid: 70000, is_paid: false });
        await setRules(S1, S1.manager, { allow_overpay: false });
        r = await call('PATCH', `/api/sessions/${v.id}/payments/${p.id}`, boss, { amount: 100001 });
        expect(r.body.code).toBe('PAYMENT_EXCEEDS_TOTAL');
        expect((await call('PATCH', `/api/sessions/${v.id}/payments/${p.id}`, boss, { amount: 100000 })).status).toBe(200);
        await setRules(S1, S1.manager, {});
        expect((await call('PATCH', `/api/sessions/${v.id}/payments/${p.id}`, boss, { amount: 0 })).status).toBe(400);
    });

    it('raising a payment so it covers the whole bill shrinks the discount (paid + discount never above the total)', async () => {
        const v = await visit(S1, boss, [{ code: 'CROWN_PFM' }]); // 100,000
        await pay(v.id, { discountId: discounts[`${S1.id}:percent`].id }); // discount 10,000
        await pay(v.id, { normalAmount: 90000 });                         // closed: 90,000 + 10,000
        const [p] = await paymentsOf(v.id);
        await call('PATCH', `/api/sessions/${v.id}/payments/${p.id}`, boss, { amount: 100000 }); // now paid in full
        const m = await money(v.id);
        expect(m.paid + m.discount).toBeLessThanOrEqual(m.total);
    });

    it('deleting a payment re-opens the visit with the right remaining', async () => {
        const v = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        await pay(v.id, { normalAmount: 20000 });
        const [p] = await paymentsOf(v.id);
        expect((await call('DELETE', `/api/sessions/${v.id}/payments/${p.id}`, boss)).status).toBe(200);
        expect(await money(v.id)).toMatchObject({ paid: 0, is_paid: false });
    });

    it('after a payment is deleted or edited, the old amount and who changed it can still be found', async () => {
        const v = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        await pay(v.id, { normalAmount: 20000 });
        const [p] = await paymentsOf(v.id);
        await call('DELETE', `/api/sessions/${v.id}/payments/${p.id}`, boss);
        await new Promise((r) => setTimeout(r, 300)); // the log is written just after the answer
        const kept = await one(`SELECT 1 AS x FROM session_payments WHERE id = $1`, [p.id]);
        const logged = await one(`SELECT 1 AS x FROM audit_logs WHERE path LIKE $1 AND details::text LIKE '%20000%'`, [`%/payments/${p.id}%`]).catch(() => undefined);
        expect(Boolean(kept || logged), 'the 20,000 payment is gone with no trace of its amount').toBe(true);
    });

    it('a payment of ANOTHER visit cannot be edited or deleted through this visit', async () => {
        const a = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        const b = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        await pay(b.id, { normalAmount: 20000 });
        const [pb] = await paymentsOf(b.id);
        expect((await call('PATCH', `/api/sessions/${a.id}/payments/${pb.id}`, boss, { amount: 1 })).status).toBe(404);
        expect((await call('DELETE', `/api/sessions/${a.id}/payments/${pb.id}`, boss)).status).toBe(404);
        expect(N((await one(`SELECT amount FROM session_payments WHERE id = $1`, [pb.id])).amount)).toBe(20000);
    });
});

describe('changing a visit after payments', () => {
    it('the total cannot drop below what was paid; raising it re-opens the visit with the right remaining', async () => {
        const v = await visit(S1, boss, [{ code: 'FILLING', quantity: 2 }]); // 80,000
        await pay(v.id, { normalAmount: 80000 });
        const lower = await call('PUT', `/api/sessions/${v.id}/normal`, boss, { works: [{ work_id: work[S1.id].FILLING, quantity: 1, tooth_number: 11 }] });
        expect(lower.status).toBe(400);
        const higher = await call('PUT', `/api/sessions/${v.id}/normal`, boss, { works: [{ work_id: work[S1.id].FILLING, quantity: 3, tooth_number: 11 }] });
        expect(higher.status).toBe(200);
        expect(await money(v.id)).toMatchObject({ total: 120000, paid: 80000, is_paid: false });
    });
});

describe('two payments at the same moment', () => {
    it('overpay off: two payments of the full remaining at once -> only ONE is saved (the row lock works)', async () => {
        await setRules(S1, S1.manager, { allow_overpay: false });
        const v = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        const results = await Promise.all([pay(v.id, { normalAmount: 20000 }), pay(v.id, { normalAmount: 20000 })]);
        await setRules(S1, S1.manager, {});
        expect(results.filter((r) => r.status === 200)).toHaveLength(1);
        expect(await money(v.id)).toMatchObject({ paid: 20000, is_paid: true });
    });

    it('the same FULL payment sent twice at once is saved once (the 2nd finds the visit already paid)', async () => {
        const v = await visit(S1, boss, [{ code: 'EXTRACTION' }]);
        await Promise.all([pay(v.id, { normalAmount: 20000 }), pay(v.id, { normalAmount: 20000 })]);
        expect((await money(v.id)).paid).toBe(20000);
    });

    it('the same PART payment sent twice at once (network retry / two tabs) is saved only once', async () => {
        const v = await visit(S1, boss, [{ code: 'CROWN_PFM' }]); // 100,000
        await Promise.all([pay(v.id, { normalAmount: 30000 }), pay(v.id, { normalAmount: 30000 })]);
        expect((await money(v.id)).paid).toBe(30000);
    });
});

describe('the unpaid list on the crowded data', () => {
    it('every visit on it really owes money, its "remaining" is right, and it answers fast', async () => {
        const t0 = Date.now();
        const r = await call('GET', '/api/sessions/unpaid', boss);
        const ms = Date.now() - t0;
        expect(r.status).toBe(200);
        const list = r.body.data;
        expect(list.length).toBeGreaterThan(0);
        for (const s of list.slice(0, 60)) {
            const m = await money(N(s.session_id));
            // listed because the visit itself is owed, or because one of its plans still is
            const planOwed = (s.treatment_plans || []).some((p) => N(p.remaining) > 0);
            expect(!m.is_paid || planOwed, `visit ${s.session_id} owes nothing`).toBe(true);
            expect(N(s.totals.remaining)).toBe(m.is_paid ? 0 : Math.max(0, m.total - m.paid - m.discount));
        }
        expect(ms).toBeLessThan(1500);
    });
});

describe('extra checks for the Part 5 fixes', () => {
    it('the repeated part payment is refused with PAYMENT_DUPLICATE; a DIFFERENT amount right after is fine', async () => {
        const v = await visit(S1, boss, [{ code: 'CROWN_PFM' }]);
        const [a, b] = await Promise.all([pay(v.id, { normalAmount: 30000 }), pay(v.id, { normalAmount: 30000 })]);
        expect([a.status, b.status].sort()).toEqual([200, 409]);
        expect([a.body.code, b.body.code]).toContain('PAYMENT_DUPLICATE');
        expect((await pay(v.id, { normalAmount: 25000 })).status).toBe(200);
        expect((await money(v.id)).paid).toBe(55000);
    });

    it('the activity log keeps the old and new amount of an edited payment', async () => {
        const v = await visit(S1, boss, [{ code: 'CROWN_PFM' }]);
        await pay(v.id, { normalAmount: 40000 });
        const [p] = await paymentsOf(v.id);
        await call('PATCH', `/api/sessions/${v.id}/payments/${p.id}`, boss, { amount: 45000 });
        await new Promise((r) => setTimeout(r, 300)); // the log is written just after the answer
        const row = await one(`SELECT details FROM audit_logs WHERE path = $1 ORDER BY id DESC LIMIT 1`, [`/api/sessions/${v.id}/payments/${p.id}`]);
        expect(row.details).toMatchObject({ old_amount: 40000, new_amount: 45000 });
    });

    it('IQD % discounts stay whole dinars (10% of 45,555 = 4,556, never 4,555.50)', async () => {
        const v = await visit(S1, boss, [{ code: 'FILLING', price: 45555 }]);
        await pay(v.id, { discountId: discounts[`${S1.id}:percent`].id });
        expect((await money(v.id)).discount).toBe(4556);
    });
});
