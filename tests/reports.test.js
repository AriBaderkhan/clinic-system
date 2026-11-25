// PART 9 — Reports, PDFs, Excel, dashboards and the Insights Assistant (the "chatbot").
// Fixed 2026-11-24: money per currency in the Insights Assistant, clinic TOTAL profit, branch separation,
// expense amounts, clear period errors, readable period line, Excel cents / doctors / busiest day.
// Every amount is checked against the "truth": a simple, independent SQL total over the raw payments / expenses.
// Made-up clinics only. Rows added for edge cases are marked and removed at the end.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import { call, one, all, query, loadClinic } from './helpers/testApp.js';
import { pdfText } from './helpers/pdfText.js';

const MARK = 'test-reports';
const N = Number;
const bin = (req) => req.buffer(true).parse((res, cb) => { const d = []; res.on('data', (c) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); });
const getPdf = async (path, user) => { const r = await bin(call('GET', path, user)); return { status: r.status, text: pdfText(r.body).join(' ').replace(/\s+/g, ' ') }; };

// the same way an accountant writes it: 1,234,567 (whole) or 1,234.50 (cents)
const fmt = (n) => { const v = Math.round(N(n) * 100) / 100; return new Intl.NumberFormat('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v); };
const pad = (n) => String(n).padStart(2, '0');
// clinic-local month window (Iraq = +03:00)
const monthWindow = (y, m) => ({ from: new Date(`${y}-${pad(m)}-01T00:00:00+03:00`), to: new Date(`${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-01T00:00:00+03:00`), first: `${y}-${pad(m)}-01`, next: `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-01` });
// the 11 full past months of the made-up data (Dec 2025 .. Oct 2026)
const MONTHS = Array.from({ length: 11 }, (_, i) => { const d = new Date(Date.UTC(2025, 11 + i, 1)); return monthWindow(d.getUTCFullYear(), d.getUTCMonth() + 1); });

// ---------- the truth (independent SQL) ----------
// money in per currency: { IQD: { sessions, plans }, USD: {...} }
async function truthMoney(tenant_id, branch_id, from, to) {
    const rows = await all(`
        SELECT currency_code AS cur, kind, SUM(amount) AS total FROM (
            SELECT currency_code, amount, 'sessions' AS kind FROM session_payments
             WHERE tenant_id = $1 AND ($2::bigint IS NULL OR branch_id = $2) AND created_at >= $3 AND created_at < $4
            UNION ALL
            SELECT currency_code, amount, 'plans' FROM treatment_payments
             WHERE tenant_id = $1 AND ($2::bigint IS NULL OR branch_id = $2) AND created_at >= $3 AND created_at < $4 AND is_deleted = false
        ) x GROUP BY 1, 2`, [tenant_id, branch_id, from, to]);
    const out = {};
    for (const r of rows) { out[r.cur] ??= { sessions: 0, plans: 0 }; out[r.cur][r.kind] = N(r.total); }
    return out;
}
// expenses per currency, by the day they happened (clinic calendar)
async function truthExpenses(tenant_id, branch_id, firstDay, nextFirstDay) {
    const rows = await all(`
        SELECT currency_code AS cur, SUM(amount) AS total FROM monthly_expenses
         WHERE tenant_id = $1 AND ($2::bigint IS NULL OR branch_id = $2)
           AND COALESCE(expense_date, (created_at AT TIME ZONE 'Asia/Baghdad')::date) >= $3::date
           AND COALESCE(expense_date, (created_at AT TIME ZONE 'Asia/Baghdad')::date) < $4::date
         GROUP BY 1`, [tenant_id, branch_id, firstDay, nextFirstDay]);
    return Object.fromEntries(rows.map((r) => [r.cur, N(r.total)]));
}
const truthAppts = async (tenant_id, branch_id, from, to) => N((await one(`
    SELECT count(*) n FROM appointments WHERE tenant_id = $1 AND ($2::bigint IS NULL OR branch_id = $2) AND is_deleted = false AND scheduled_start >= $3 AND scheduled_start < $4`, [tenant_id, branch_id, from, to])).n);
// money in per doctor per currency (payment -> visit -> doctor); plan payments with no visit -> doctor null
const truthDoctorMoney = (tenant_id, branch_id, from, to) => all(`
    SELECT a.doctor_id, x.cur, SUM(x.amount) total FROM (
        SELECT sp.session_id, sp.currency_code cur, sp.amount FROM session_payments sp
         WHERE sp.tenant_id = $1 AND ($2::bigint IS NULL OR sp.branch_id = $2) AND sp.created_at >= $3 AND sp.created_at < $4
        UNION ALL
        SELECT tp.session_id, tp.currency_code, tp.amount FROM treatment_payments tp
         WHERE tp.tenant_id = $1 AND ($2::bigint IS NULL OR tp.branch_id = $2) AND tp.created_at >= $3 AND tp.created_at < $4 AND NOT tp.is_deleted
    ) x LEFT JOIN sessions s ON s.id = x.session_id LEFT JOIN appointments a ON a.id = s.appointment_id
    GROUP BY 1, 2`, [tenant_id, branch_id, from, to]);

const profitOf = (rev, exp) => ({ profit: Math.max(rev - exp, 0), loss: Math.max(exp - rev, 0) });

let smile, care, S1, careBranches;
const await_names = {};
const branchName = async (id) => (await one(`SELECT name FROM branches WHERE id = $1`, [id])).name;

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    care = await loadClinic('care.example.com');
    S1 = smile.branches[0];
    careBranches = care.branches;
    for (const b of [...smile.branches, ...care.branches]) await_names[b.id] = await branchName(b.id);
});

afterAll(async () => {
    await query(`DELETE FROM session_payments WHERE note = $1`, [MARK]);
    await query(`DELETE FROM treatment_payments WHERE note = $1`, [MARK]);
    await query(`DELETE FROM monthly_expenses WHERE type = $1`, [MARK]);
});

// =====================================================================================
describe('branch monthly PDF: every printed amount = the truth (every branch, 11 months)', () => {
    it('sessions, plans, total, expense, profit, loss and appointment count, per currency', async () => {
        const wrong = [];
        let checked = 0;
        for (const clinic of [smile, care]) {
            for (const b of clinic.branches) {
                for (const M of MONTHS) {
                    const { status, text } = await getPdf(`/api/reports/monthly/pdf?month=${M.first}`, b.manager);
                    expect(status).toBe(200);
                    const money = await truthMoney(clinic.tenant_id, b.id, M.from, M.to);
                    const exp = await truthExpenses(clinic.tenant_id, b.id, M.first, M.next);
                    for (const cur of new Set([...Object.keys(money), ...Object.keys(exp)])) {
                        const s = money[cur]?.sessions ?? 0, p = money[cur]?.plans ?? 0, e = exp[cur] ?? 0;
                        const { profit, loss } = profitOf(s + p, e);
                        const expected = `Revenue (${cur}) Sessions ${fmt(s)} ${cur} Treatment Plans ${fmt(p)} ${cur} Total ${fmt(s + p)} ${cur} Expense ${fmt(e)} ${cur} Profit ${fmt(profit)} ${cur} Loss ${fmt(loss)} ${cur}`;
                        checked++;
                        if (!text.includes(expected)) wrong.push({ branch: b.id, month: M.first, expected, got: text.slice(text.indexOf(`Revenue (${cur})`), text.indexOf(`Revenue (${cur})`) + 200) });
                    }
                    const appts = await truthAppts(clinic.tenant_id, b.id, M.from, M.to);
                    if (!text.includes(`All Appointments ${appts} `)) wrong.push({ branch: b.id, month: M.first, appts });
                }
            }
        }
        expect(checked).toBeGreaterThan(50);
        expect(wrong).toEqual([]);
    }, 300000);
});

describe('clinic-wide PDF (owner): every branch row + the TOTAL rows = the truth', () => {
    it('each branch + currency row, and the TOTAL revenue / expense per currency', async () => {
        const wrong = [];
        for (const clinic of [smile, care]) {
            for (const M of MONTHS) {
                const { status, text } = await getPdf(`/api/reports/monthly/pdf?month=${M.first}`, clinic.manager);
                expect(status).toBe(200);
                const totals = {};
                for (const b of clinic.branches) {
                    const name = await branchName(b.id);
                    const money = await truthMoney(clinic.tenant_id, b.id, M.from, M.to);
                    const exp = await truthExpenses(clinic.tenant_id, b.id, M.first, M.next);
                    for (const cur of new Set([...Object.keys(money), ...Object.keys(exp)])) {
                        const s = money[cur]?.sessions ?? 0, p = money[cur]?.plans ?? 0, e = exp[cur] ?? 0;
                        const { profit, loss } = profitOf(s + p, e);
                        const row = `${name} ${cur} ${fmt(s)} ${fmt(p)} ${fmt(s + p)} ${fmt(e)} ${fmt(profit)} ${fmt(loss)}`;
                        if (!text.includes(row)) wrong.push({ month: M.first, row });
                        totals[cur] ??= { s: 0, p: 0, e: 0 };
                        totals[cur].s += s; totals[cur].p += p; totals[cur].e += e;
                    }
                }
                for (const [cur, t] of Object.entries(totals)) {
                    const head = `TOTAL ${cur} ${fmt(t.s)} ${fmt(t.p)} ${fmt(t.s + t.p)} ${fmt(t.e)}`;
                    if (!text.includes(head)) wrong.push({ month: M.first, head });
                }
            }
        }
        expect(wrong).toEqual([]);
    }, 300000);

    it('the TOTAL profit / loss is the WHOLE clinic\'s result (one branch at a loss is set against the others\' profit)', async () => {
        // October: put Smile's 3rd branch at a loss with a made-up expense of 99,000,000 IQD (its revenue is ~58 million)
        const M = MONTHS[MONTHS.length - 1];
        const b3 = smile.branches[2];
        await query(`INSERT INTO monthly_expenses (created_by, tenant_id, branch_id, type, amount, expense_date, currency_code) VALUES ($1, $2, $3, $4, 99000000, $5, 'IQD')`,
            [smile.manager.id, smile.tenant_id, b3.id, MARK, M.first]);
        try {
            const money = await truthMoney(smile.tenant_id, null, M.from, M.to);
            const exp = await truthExpenses(smile.tenant_id, null, M.first, M.next);
            const rev = money.IQD.sessions + money.IQD.plans;
            const { profit, loss } = profitOf(rev, exp.IQD);
            const { text } = await getPdf(`/api/reports/monthly/pdf?month=${M.first}`, smile.manager);
            const totalRow = text.slice(text.indexOf('TOTAL IQD'), text.indexOf('TOTAL IQD') + 120);
            expect(totalRow).toContain(`${fmt(rev)} ${fmt(exp.IQD)} ${fmt(profit)} ${fmt(loss)}`);
        } finally {
            await query(`DELETE FROM monthly_expenses WHERE type = $1`, [MARK]);
        }
    });
});

describe('who can see which report', () => {
    it('reception and doctor cannot download the branch report (403)', async () => {
        expect((await call('GET', '/api/reports/monthly/pdf?month=2026-10-01', S1.reception)).status).toBe(403);
        expect((await call('GET', '/api/reports/monthly/pdf?month=2026-10-01', S1.doctors[0])).status).toBe(403);
    });

    it('a BRANCH manager cannot get ANOTHER branch\'s report by adding ?branch_id= (he gets his own branch)', async () => {
        const other = smile.branches[1];
        const { status, text } = await getPdf(`/api/reports/monthly/pdf?month=2026-10-01&branch_id=${other.id}`, S1.manager);
        const M = MONTHS[MONTHS.length - 1];
        const otherMoney = await truthMoney(smile.tenant_id, other.id, M.from, M.to);
        const leaked = status === 200 && text.includes(`Sessions ${fmt(otherMoney.IQD.sessions)} IQD`);
        expect(leaked).toBe(false);
        const own = await truthMoney(smile.tenant_id, S1.id, M.from, M.to);
        expect(text).toContain(`Sessions ${fmt(own.IQD.sessions)} IQD`);
    });

    it('the owner asking for a branch of ANOTHER clinic gets 404 BRANCH_NOT_FOUND', async () => {
        const r = await call('GET', `/api/reports/monthly/pdf?month=2026-10-01&branch_id=${care.branches[0].id}`, smile.manager);
        expect([r.status, r.body.code]).toEqual([404, 'BRANCH_NOT_FOUND']);
    });

    it('a manager of another clinic asking for this clinic\'s branch gets nothing of it', async () => {
        const { text } = await getPdf(`/api/reports/monthly/pdf?month=2026-10-01&branch_id=${S1.id}`, care.branches[0].manager);
        const M = MONTHS[MONTHS.length - 1];
        const money = await truthMoney(smile.tenant_id, S1.id, M.from, M.to);
        expect(text.includes(fmt(money.IQD.sessions))).toBe(false);
        expect(text.includes('Smile')).toBe(false);
    });

    it('the Insights Assistant is refused for branch manager, doctor and reception (403)', async () => {
        for (const u of [S1.manager, S1.doctors[0], S1.reception]) {
            expect((await call('GET', '/api/reports/insights/revenue_total?month=2026-10-01', u)).status).toBe(403);
            expect((await call('GET', '/api/reports/insights/excel?month=2026-10', u)).status).toBe(403);
        }
    });

    it('a doctor\'s own report only shows HIS visits (another doctor\'s money is not in it)', async () => {
        const [dA, dB] = S1.doctors;
        const M = MONTHS[MONTHS.length - 1];
        const r = await call('GET', `/api/docs/report?month=${M.first}`, dA);
        const rows = await truthDoctorMoney(smile.tenant_id, S1.id, M.from, M.to);
        const mine = rows.filter((x) => N(x.doctor_id) === dA.id).reduce((a, x) => a + N(x.total), 0);
        const his = rows.filter((x) => N(x.doctor_id) === dB.id).reduce((a, x) => a + N(x.total), 0);
        expect(r.body.data.revenue.reduce((a, x) => a + x.total, 0)).toBe(mine);
        expect(mine).not.toBe(his);
    });
});

// =====================================================================================
describe('doctor report (screen + PDF) = the truth, and all doctors add up to the branch', () => {
    it('every doctor, every branch, 11 months', async () => {
        const wrong = [];
        for (const clinic of [smile, care]) {
            for (const b of clinic.branches) {
                for (const M of MONTHS) {
                    const truth = await truthDoctorMoney(clinic.tenant_id, b.id, M.from, M.to);
                    const branchMoney = await truthMoney(clinic.tenant_id, b.id, M.from, M.to);
                    const sumByCur = {};
                    for (const d of b.doctors) {
                        const r = await call('GET', `/api/docs/report?month=${M.first}`, d);
                        expect(r.status).toBe(200);
                        for (const line of r.body.data.revenue) {
                            const t = truth.filter((x) => N(x.doctor_id) === d.id && x.cur === line.currency_code).reduce((a, x) => a + N(x.total), 0);
                            if (Math.abs(line.total - t) > 0.001) wrong.push({ doctor: d.id, month: M.first, cur: line.currency_code, screen: line.total, truth: t });
                            sumByCur[line.currency_code] = (sumByCur[line.currency_code] || 0) + line.total;
                        }
                        // the PDF prints the same numbers as the screen
                        if (M === MONTHS[MONTHS.length - 1]) {
                            const { text } = await getPdf(`/api/docs/report/pdf?month=${M.first}`, d);
                            for (const line of r.body.data.revenue) {
                                const c = line.currency_code;
                                const want = `Sessions (${c}) ${fmt(line.sessions)} ${c} Treatment Plans (${c}) ${fmt(line.treatment_plans)} ${c} Total (${c}) ${fmt(line.total)} ${c}`;
                                if (!text.includes(want)) wrong.push({ pdf: d.id, want });
                            }
                        }
                    }
                    // all doctors (+ plan payments with no visit) = the whole branch
                    const noVisit = truth.filter((x) => x.doctor_id === null);
                    for (const [cur, m] of Object.entries(branchMoney)) {
                        const doctors = (sumByCur[cur] || 0) + noVisit.filter((x) => x.cur === cur).reduce((a, x) => a + N(x.total), 0);
                        if (Math.abs(doctors - (m.sessions + m.plans)) > 0.001) wrong.push({ branch: b.id, month: M.first, cur, doctors, branch_total: m.sessions + m.plans });
                    }
                }
            }
        }
        expect(wrong).toEqual([]);
    }, 600000);
});

// =====================================================================================
describe('dashboards = the truth', () => {
    const now = () => new Date();
    // clinic month start (k = 0 this month, -1 last month)
    const monthStartNow = (k = 0) => { const w = new Date(Date.now() + 3 * 3600e3); return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() + k, 1) - 3 * 3600e3); };

    it('branch dashboard: this month + last month money per currency (every branch)', async () => {
        const wrong = [];
        for (const clinic of [smile, care]) {
            for (const b of clinic.branches) {
                const r = await call('GET', '/api/branches/dashboard', b.manager);
                expect(r.status).toBe(200);
                const ms = monthStartNow();
                const lastStart = monthStartNow(-1);
                const thisM = await truthMoney(clinic.tenant_id, b.id, ms, now());
                const lastM = await truthMoney(clinic.tenant_id, b.id, lastStart, ms);
                for (const row of r.body.data.revenue) {
                    const c = row.currency_code;
                    const t1 = (thisM[c]?.sessions ?? 0) + (thisM[c]?.plans ?? 0);
                    const t2 = (lastM[c]?.sessions ?? 0) + (lastM[c]?.plans ?? 0);
                    if (row.this_month !== t1 || row.last_month !== t2) wrong.push({ branch: b.id, c, screen: [row.this_month, row.last_month], truth: [t1, t2] });
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    it('branch dashboard "still owed by visits" = the unpaid list (same visits, same total)', async () => {
        const wrong = [];
        for (const clinic of [smile, care]) {
            for (const b of clinic.branches) {
                const dash = (await call('GET', '/api/branches/dashboard', b.manager)).body.data.unpaid;
                const list = (await call('GET', '/api/sessions/unpaid', b.manager)).body.data;
                const byCur = {};
                for (const s of list) {
                    if (N(s.totals.remaining) > 0) { byCur[s.currency_code] ??= { count: 0, total: 0 }; byCur[s.currency_code].count++; byCur[s.currency_code].total += N(s.totals.remaining); }
                }
                for (const row of dash) {
                    const l = byCur[row.currency_code] || { count: 0, total: 0 };
                    if (row.visits.count !== l.count || Math.abs(row.visits.total - l.total) > 0.001) wrong.push({ branch: b.id, cur: row.currency_code, dashboard: row.visits, list: l });
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    it('clinic dashboard (owner): month money per branch + all branches = the truth = the branch dashboards', async () => {
        const wrong = [];
        for (const clinic of [smile, care]) {
            const r = (await call('GET', '/api/tenants/dashboard', clinic.manager)).body.data;
            const ms = monthStartNow();
            const all_ = await truthMoney(clinic.tenant_id, null, ms, now());
            for (const row of r.month_revenue) {
                const t = (all_[row.currency_code]?.sessions ?? 0) + (all_[row.currency_code]?.plans ?? 0);
                if (row.total !== t) wrong.push({ clinic: clinic.tenant_id, cur: row.currency_code, screen: row.total, truth: t });
            }
            for (const b of r.branches) {
                const own = (await call('GET', '/api/branches/dashboard', clinic.branches.find((x) => x.id === N(b.id)).manager)).body.data.revenue;
                for (const row of b.revenue) {
                    const fromBranch = own.find((x) => x.currency_code === row.currency_code)?.this_month;
                    if (row.total !== fromBranch) wrong.push({ branch: b.id, cur: row.currency_code, clinicDash: row.total, branchDash: fromBranch });
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    it('saved visit / plan "paid" totals = the sum of their payments (the dashboards and unpaid list read the saved totals)', async () => {
        const T = [smile.tenant_id, care.tenant_id];
        const visits = await one(`
            SELECT count(*) n FROM sessions s
             WHERE s.tenant_id = ANY($1) AND s.is_deleted = false
               AND COALESCE(s.total_paid, 0) <> COALESCE((SELECT SUM(amount) FROM session_payments sp WHERE sp.session_id = s.id), 0)`, [T]);
        const plans = await one(`
            SELECT count(*) n FROM treatment_plans tp
             WHERE tp.tenant_id = ANY($1) AND tp.is_deleted = false
               AND COALESCE(tp.total_paid, 0) <> COALESCE((SELECT SUM(amount) FROM treatment_payments x WHERE x.treatment_plan_id = tp.id AND NOT x.is_deleted), 0)`, [T]);
        expect({ visits: N(visits.n), plans: N(plans.n) }).toEqual({ visits: 0, plans: 0 });
    });
});

// =====================================================================================
describe('Insights Assistant (the chatbot): every question answers, and the numbers = the truth', () => {
    let catalog;
    beforeAll(async () => { catalog = (await call('GET', '/api/reports/insights/catalog', smile.manager)).body.data; });

    it('every question in the menu answers (both clinics, plain + compare), no NaN / empty values', async () => {
        const bad = [];
        expect(catalog.length).toBeGreaterThanOrEqual(19);
        for (const clinic of [smile, care]) {
            for (const m of catalog) {
                for (const qs of ['month=2026-10-01', 'month=2026-10-01&compare=true', 'month=2026-10-01&compareMonth=2026-09-01', 'from=2026-10-05&to=2026-10-20']) {
                    const r = await call('GET', `/api/reports/insights/${m.id}?${qs}`, clinic.manager);
                    if (r.status !== 200 || JSON.stringify(r.body).includes('NaN')) bad.push({ id: m.id, qs, status: r.status });
                }
            }
        }
        expect(bad).toEqual([]);
    }, 120000);

    it('a question that does not exist answers 404; a bad month answers 400 (with a code the screen can translate)', async () => {
        const r1 = await call('GET', '/api/reports/insights/drop_tables?month=2026-10-01', smile.manager);
        const r2 = await call('GET', '/api/reports/insights/revenue_total?month=2026-13-01', smile.manager);
        expect(r1.status).toBe(404);
        expect(r2.status).toBe(400);
    });

    it('a FUTURE month answers 400 MONTH_IN_FUTURE on the PDF, the doctor report and Insights (not a server error)', async () => {
        const r = await call('GET', '/api/reports/insights/revenue_total?month=2099-01-01', smile.manager);
        const p = await call('GET', '/api/reports/monthly/pdf?month=2099-01-01', smile.manager);
        const d = await call('GET', '/api/docs/report?month=2099-01-01', S1.doctors[0]);
        expect([r.status, p.status, d.status]).toEqual([400, 400, 400]);
        expect([r.body.code, p.body.code, d.body.code]).toEqual(['MONTH_IN_FUTURE', 'MONTH_IN_FUTURE', 'MONTH_IN_FUTURE']);
    });

    it('month 00 / 13 answers 400 VALIDATION_ERROR (not a server error)', async () => {
        for (const m of ['2026-00-01', '2026-13-01']) {
            const r = await call('GET', `/api/reports/monthly/pdf?month=${m}`, smile.manager);
            expect([r.status, r.body.code]).toEqual([400, 'VALIDATION_ERROR']);
        }
    });

    it('report / insight validation errors carry a "code" (the screen translates by code)', async () => {
        const r = await call('GET', '/api/reports/insights/revenue_total?month=bad', smile.manager);
        expect(r.body.code).toBe('VALIDATION_ERROR');
    });

    it('one-currency clinic (Smile, IQD): total revenue, per branch, per doctor = the truth, 11 months', async () => {
        const wrong = [];
        for (const M of MONTHS) {
            const res = (await call('GET', `/api/reports/insights/revenue_total?month=${M.first}`, smile.manager)).body.data.result;
            expect(res.currencies.map((c) => c.currency_code)).toEqual(['IQD']);
            const tot = res.currencies[0];
            const money = await truthMoney(smile.tenant_id, null, M.from, M.to);
            const t = money.IQD.sessions + money.IQD.plans;
            if (tot.value !== t) wrong.push({ month: M.first, total: tot.value, truth: t });
            for (const b of smile.branches) {
                const name = await branchName(b.id);
                const bm = await truthMoney(smile.tenant_id, b.id, M.from, M.to);
                const v = tot.branches.find((x) => x.branch_name === name)?.value;
                if (v !== bm.IQD.sessions + bm.IQD.plans) wrong.push({ month: M.first, branch: name, v });
            }
            const perDoc = (await call('GET', `/api/reports/insights/revenue_per_doctor?month=${M.first}`, smile.manager)).body.data.result.currencies[0];
            if (Math.abs(perDoc.value - t) > 0.001) wrong.push({ month: M.first, perDoctorSum: perDoc.value, truth: t });
            const appts = (await call('GET', `/api/reports/insights/appts_total?month=${M.first}`, smile.manager)).body.data.result.value;
            if (appts !== await truthAppts(smile.tenant_id, null, M.from, M.to)) wrong.push({ month: M.first, appts });
        }
        expect(wrong).toEqual([]);
    }, 120000);

    it('counts = the truth: cancelled / no-show, follow-up, treatments done', async () => {
        const M = MONTHS[MONTHS.length - 1];
        const cn = (await call('GET', `/api/reports/insights/appts_cancel_noshow?month=${M.first}`, smile.manager)).body.data.result;
        const t = await all(`SELECT status, count(*) n FROM appointments WHERE tenant_id = $1 AND is_deleted = false AND scheduled_start >= $2 AND scheduled_start < $3 AND status IN ('cancelled','no_show') GROUP BY 1`, [smile.tenant_id, M.from, M.to]);
        expect(cn.value).toBe(t.reduce((a, x) => a + N(x.n), 0));
        const tr = (await call('GET', `/api/reports/insights/treatments_all?month=${M.first}`, smile.manager)).body.data.result;
        const q = await one(`SELECT SUM(COALESCE(sw.quantity,1)) n FROM session_works sw JOIN sessions s ON s.id = sw.session_id WHERE s.tenant_id = $1 AND s.created_at >= $2 AND s.created_at < $3 AND NOT sw.is_deleted`, [smile.tenant_id, M.from, M.to]);
        expect(tr.value).toBe(N(q.n));
    });

    it('two-currency clinic (Care: IQD + USD): "Total revenue" gives one total PER CURRENCY = the truth, 11 months, with compare', async () => {
        const wrong = [];
        for (const M of MONTHS) {
            const r = (await call('GET', `/api/reports/insights/revenue_total?month=${M.first}&compare=true`, care.manager)).body.data.result;
            expect(r.value).toBeUndefined(); // no mixed number any more
            const money = await truthMoney(care.tenant_id, null, M.from, M.to);
            for (const c of r.currencies) {
                const t = (money[c.currency_code]?.sessions ?? 0) + (money[c.currency_code]?.plans ?? 0);
                if (Math.abs(c.value - t) > 0.001) wrong.push({ month: M.first, cur: c.currency_code, value: c.value, truth: t });
                for (const b of care.branches) {
                    const bm = await truthMoney(care.tenant_id, b.id, M.from, M.to);
                    const v = c.branches.find((x) => x.branch_name === (await_names[b.id]))?.value ?? 0;
                    const tb = (bm[c.currency_code]?.sessions ?? 0) + (bm[c.currency_code]?.plans ?? 0);
                    if (Math.abs(v - tb) > 0.001) wrong.push({ month: M.first, cur: c.currency_code, branch: b.id, v, tb });
                }
                expect(c.compare.current).toBe(c.value); // growth is per currency too
            }
            expect(r.currencies.map((c) => c.currency_code).sort()).toEqual(Object.keys(money).sort());
        }
        expect(wrong).toEqual([]);
    }, 120000);

    it('two-currency clinic: "Revenue per doctor" is per currency, doctors add up to the truth, shares are per currency', async () => {
        const M = MONTHS[MONTHS.length - 1];
        const money = await truthMoney(care.tenant_id, null, M.from, M.to);
        const doc = (await call('GET', `/api/reports/insights/revenue_per_doctor?month=${M.first}`, care.manager)).body.data.result;
        for (const c of doc.currencies) {
            expect(c.value).toBe((money[c.currency_code].sessions) + (money[c.currency_code].plans));
            const shares = c.breakdown.reduce((a, x) => a + x.rate, 0);
            expect(Math.abs(shares - 100)).toBeLessThanOrEqual(0.2); // 100% inside each currency
            expect(c.breakdown.every((x) => x.rate > 0)).toBe(true);  // no "0%" doctor any more
        }
        const usd = doc.currencies.find((c) => c.currency_code === 'USD');
        expect(usd.breakdown.every((x) => x.label.includes('Kirkuk'))).toBe(true);
    });

    it('two-currency clinic: "Revenue per treatment" is per currency (each total = billed work of that currency)', async () => {
        const M = MONTHS[MONTHS.length - 1];
        const r = (await call('GET', `/api/reports/insights/revenue_per_treatment?month=${M.first}`, care.manager)).body.data.result;
        const t = await all(`SELECT s.currency_code cur, SUM(sw.total_price) total FROM session_works sw JOIN sessions s ON s.id = sw.session_id
                              WHERE s.tenant_id = $1 AND s.created_at >= $2 AND s.created_at < $3 AND NOT sw.is_deleted GROUP BY 1`, [care.tenant_id, M.from, M.to]);
        for (const c of r.currencies) expect(c.value).toBe(N(t.find((x) => x.cur === c.currency_code).total));
        expect(r.currencies.length).toBe(t.length);
    });
});

// =====================================================================================
describe('Insights Excel = the truth', () => {
    // the made-up clinics were created on the seed day; their data goes back 12 months -> let the Excel reach those months
    let joined;
    beforeAll(async () => {
        joined = await all(`SELECT id, created_at FROM tenants WHERE id = ANY($1)`, [[smile.tenant_id, care.tenant_id]]);
        await query(`UPDATE tenants SET created_at = '2025-11-01T00:00:00+03:00' WHERE id = ANY($1)`, [[smile.tenant_id, care.tenant_id]]);
    });
    afterAll(async () => { for (const t of joined) await query(`UPDATE tenants SET created_at = $2 WHERE id = $1`, [t.id, t.created_at]); });

    const sheetRows = (ws) => { const rows = []; ws.eachRow((row) => rows.push(row.values.slice(1).map((v) => (v && v.richText ? v.richText.map((t) => t.text).join('') : v)))); return rows; };
    const getXlsx = async (user, month) => { const r = await bin(call('GET', `/api/reports/insights/excel?month=${month}`, user)); const wb = new ExcelJS.Workbook(); if (r.status === 200) await wb.xlsx.load(r.body); return { status: r.status, wb }; };

    it('Revenue sheet: total per currency (visits, plans, total) = the truth, both clinics, 11 months', async () => {
        const wrong = [];
        for (const clinic of [smile, care]) {
            for (const M of MONTHS) {
                const { status, wb } = await getXlsx(clinic.manager, M.first.slice(0, 7));
                expect(status).toBe(200);
                const rows = sheetRows(wb.getWorksheet('Revenue'));
                const money = await truthMoney(clinic.tenant_id, null, M.from, M.to);
                for (const [cur, m] of Object.entries(money)) {
                    const row = rows.find((r) => r[0] === cur && typeof r[1] === 'number');
                    if (!row || row[1] !== m.sessions || row[2] !== m.plans || row[3] !== m.sessions + m.plans) wrong.push({ clinic: clinic.tenant_id, month: M.first, cur, row, truth: m });
                }
            }
        }
        expect(wrong).toEqual([]);
    }, 300000);

    it('Revenue sheet: the doctors add up to the total, per currency', async () => {
        const wrong = [];
        for (const clinic of [smile, care]) {
            const M = MONTHS[MONTHS.length - 1];
            const { wb } = await getXlsx(clinic.manager, M.first.slice(0, 7));
            const rows = sheetRows(wb.getWorksheet('Revenue'));
            const start = rows.findIndex((r) => r[0] === 'Doctor');
            const docs = rows.slice(start + 1).filter((r) => typeof r[2] === 'number');
            const money = await truthMoney(clinic.tenant_id, null, M.from, M.to);
            for (const [cur, m] of Object.entries(money)) {
                const sum = docs.filter((r) => r[1] === cur).reduce((a, r) => a + r[2], 0);
                if (Math.abs(sum - (m.sessions + m.plans)) > 0.001) wrong.push({ clinic: clinic.tenant_id, cur, doctors: sum, total: m.sessions + m.plans });
            }
        }
        expect(wrong).toEqual([]);
    });

    it('Works sheet: times done = the truth; Appointments sheet: total + completed = the truth', async () => {
        const M = MONTHS[MONTHS.length - 1];
        for (const clinic of [smile, care]) {
            const { wb } = await getXlsx(clinic.manager, M.first.slice(0, 7));
            const works = sheetRows(wb.getWorksheet('Works')).filter((r) => typeof r[0] === 'number' && typeof r[2] === 'number');
            const q = await one(`SELECT SUM(COALESCE(sw.quantity,1)) n FROM session_works sw JOIN sessions s ON s.id = sw.session_id WHERE s.tenant_id = $1 AND s.created_at >= $2 AND s.created_at < $3 AND NOT sw.is_deleted`, [clinic.tenant_id, M.from, M.to]);
            expect(works.reduce((a, r) => a + r[2], 0)).toBe(N(q.n));
            const ap = sheetRows(wb.getWorksheet('Appointments')).map((r) => String(r[0] ?? ''));
            const apptsTruth = await truthAppts(clinic.tenant_id, null, M.from, M.to);
            expect(ap.some((t) => t.includes(`Total appointments:  ${apptsTruth}`))).toBe(true);
        }
    });

    it('Works sheet: plan works show ALL the plan money collected that month (nothing lost, nothing counted twice)', async () => {
        const M = MONTHS[MONTHS.length - 1];
        const { wb } = await getXlsx(smile.manager, M.first.slice(0, 7));
        const rows = sheetRows(wb.getWorksheet('Works')).filter((r) => typeof r[0] === 'number' && typeof r[3] === 'number');
        const planCodes = (await all(`SELECT DISTINCT name FROM work_catalog WHERE tenant_id = $1 AND is_plan`, [smile.tenant_id])).map((x) => x.name);
        const shown = rows.filter((r) => planCodes.includes(r[1])).reduce((a, r) => a + r[3], 0);
        const money = await truthMoney(smile.tenant_id, null, M.from, M.to);
        expect(shown).toBe(money.IQD.plans);
    });

    it('USD amounts keep their cents in the Excel (exact value, cents format) and in the PDF', async () => {
        const M = MONTHS[MONTHS.length - 1];
        const s = await one(`SELECT id FROM sessions WHERE tenant_id = $1 AND currency_code = 'USD' AND created_at >= $2 AND created_at < $3 LIMIT 1`, [care.tenant_id, M.from, M.to]);
        const sb = await one(`SELECT branch_id FROM sessions WHERE id = $1`, [s.id]);
        await query(`INSERT INTO session_payments (session_id, amount, note, tenant_id, branch_id, currency_code, created_at) VALUES ($1, 0.10, $2, $3, $4, 'USD', $5), ($1, 0.20, $2, $3, $4, 'USD', $5)`,
            [s.id, MARK, care.tenant_id, sb.branch_id, new Date(M.from.getTime() + 86400e3)]);
        try {
            const money = await truthMoney(care.tenant_id, null, M.from, M.to);
            const { wb } = await getXlsx(care.manager, M.first.slice(0, 7));
            const ws = wb.getWorksheet('Revenue');
            let cell = null;
            ws.eachRow((row) => { if (row.getCell(1).value === 'USD' && typeof row.getCell(2).value === 'number') cell = row.getCell(2); });
            expect(cell.value).toBe(money.USD.sessions); // exact cents, no 0.30000000000000004
            expect(cell.numFmt).toBe('#,##0.00');     // shows the cents
            let iqd = null;
            ws.eachRow((row) => { if (row.getCell(1).value === 'IQD' && typeof row.getCell(2).value === 'number') iqd = row.getCell(2); });
            expect(iqd.numFmt).toBe('#,##0');          // dinars stay whole
            let usdTotal = null;
            ws.eachRow((row) => { if (row.getCell(1).value === 'USD' && typeof row.getCell(4).value === 'number') usdTotal = row.getCell(4).value; });
            expect(usdTotal).toBe(Math.round((money.USD.sessions + money.USD.plans) * 100) / 100); // exact, no 0.30000000000000004
            // the PDF shows the cents too
            const { text } = await getPdf(`/api/reports/monthly/pdf?month=${M.first}`, care.manager);
            expect(text).toContain(fmt(money.USD.sessions));
        } finally {
            await query(`DELETE FROM session_payments WHERE note = $1`, [MARK]);
        }
    });

    it('a plan payment with NO visit is in the Excel and Insights as "Unassigned", so the doctors still add up to the total', async () => {
        const M = MONTHS[MONTHS.length - 1];
        const plan = await one(`SELECT id, branch_id FROM treatment_plans WHERE tenant_id = $1 AND currency_code = 'IQD' AND NOT is_deleted ORDER BY id LIMIT 1`, [smile.tenant_id]);
        await query(`INSERT INTO treatment_payments (treatment_plan_id, session_id, amount, note, tenant_id, branch_id, currency_code, created_at) VALUES ($1, NULL, 7777, $2, $3, $4, 'IQD', $5)`,
            [plan.id, MARK, smile.tenant_id, plan.branch_id, new Date(M.from.getTime() + 2 * 86400e3)]);
        try {
            const money = await truthMoney(smile.tenant_id, null, M.from, M.to);
            const { wb } = await getXlsx(smile.manager, M.first.slice(0, 7));
            const rows = sheetRows(wb.getWorksheet('Revenue'));
            const docs = rows.slice(rows.findIndex((r) => r[0] === 'Doctor') + 1).filter((r) => typeof r[2] === 'number');
            expect(docs.find((r) => r[0] === 'Unassigned')?.[2]).toBe(7777);
            expect(docs.reduce((a, r) => a + r[2], 0)).toBe(money.IQD.sessions + money.IQD.plans);
            const ins = (await call('GET', `/api/reports/insights/revenue_per_doctor?month=${M.first}`, smile.manager)).body.data.result.currencies[0];
            expect(ins.breakdown.find((x) => x.label === 'Unassigned')?.value).toBe(7777);
            expect(ins.value).toBe(money.IQD.sessions + money.IQD.plans);
        } finally {
            await query(`DELETE FROM treatment_payments WHERE note = $1`, [MARK]);
        }
    });

    it('"Busiest day" in the Excel is the clinic\'s day (Iraq time), the same as the database says', async () => {
        for (const M of MONTHS) {
            const { wb } = await getXlsx(smile.manager, M.first.slice(0, 7));
            const line = sheetRows(wb.getWorksheet('Appointments')).map((r) => String(r[0] ?? '')).find((t) => t.startsWith('Busiest day'));
            const d = await one(`SELECT (scheduled_start AT TIME ZONE 'Asia/Baghdad')::date::text d, count(*) n FROM appointments WHERE tenant_id = $1 AND NOT is_deleted AND scheduled_start >= $2 AND scheduled_start < $3 GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1`, [smile.tenant_id, M.from, M.to]);
            expect(line).toContain(`${d.d}  (${d.n} appointments)`);
        }
    });

    it('month rules: future month, month before the clinic joined, bad format -> 400', async () => {
        expect((await call('GET', '/api/reports/insights/excel?month=2099-01', smile.manager)).status).toBe(400);
        expect((await call('GET', '/api/reports/insights/excel?month=2001-01', smile.manager)).status).toBe(400);
        expect((await call('GET', '/api/reports/insights/excel?month=abc', smile.manager)).status).toBe(400);
    });
});

// =====================================================================================
describe('expense amounts (they go straight into profit)', () => {
    it('a negative or 0 expense is refused with VALIDATION_ERROR (it would raise the profit); 0.01 is fine', async () => {
        for (const amount of [-5000000, -0.01, 0]) {
            const r = await call('POST', '/api/monthly-expenses', smile.manager, { type: MARK, amount, expense_date: '2026-10-15' });
            expect([r.status, r.body.code]).toEqual([400, 'VALIDATION_ERROR']);
        }
        expect((await call('POST', '/api/monthly-expenses', smile.manager, { type: MARK, amount: 0.01, expense_date: '2026-10-15' })).status).toBe(201);
    });

    it('a big expense (100,000,000 IQD, e.g. a CBCT machine) is saved; above the money maximum -> clear 400', async () => {
        const r = await call('POST', '/api/monthly-expenses', smile.manager, { type: MARK, amount: 100000000, expense_date: '2026-10-15' });
        expect(r.status).toBe(201);
        expect(N(r.body.data.amount)).toBe(100000000);
        const max = await call('POST', '/api/monthly-expenses', smile.manager, { type: MARK, amount: 9999999999.99, expense_date: '2026-10-15' });
        expect(max.status).toBe(201);
        const over = await call('POST', '/api/monthly-expenses', smile.manager, { type: MARK, amount: 10000000000, expense_date: '2026-10-15' });
        expect([over.status, over.body.code]).toEqual([400, 'VALIDATION_ERROR']);
    });

    it('editing an expense: a wrong amount answers 400 VALIDATION_ERROR and nothing is saved (it used to answer 200)', async () => {
        const c = await call('POST', '/api/monthly-expenses', smile.manager, { type: MARK, amount: 1000, expense_date: '2026-10-15' });
        const id = N(c.body.data.id);
        for (const amount of [-1, 0, 'x']) {
            const r = await call('PUT', `/api/monthly-expenses/${id}`, smile.manager, { amount });
            expect([r.status, r.body.code]).toEqual([400, 'VALIDATION_ERROR']);
        }
        expect(N((await one(`SELECT amount FROM monthly_expenses WHERE id = $1`, [id])).amount)).toBe(1000);
        expect((await call('PUT', `/api/monthly-expenses/${id}`, smile.manager, { amount: 2500 })).status).toBe(200);
        expect(N((await one(`SELECT amount FROM monthly_expenses WHERE id = $1`, [id])).amount)).toBe(2500);
    });
});

describe('month edges (Iraq time): a payment at 23:59 on the 31st is October, at 00:00 on the 1st is November', () => {
    it('branch PDF for October / November and a custom one-day range', async () => {
        const s = await one(`SELECT id FROM sessions WHERE branch_id = $1 AND currency_code = 'IQD' ORDER BY id LIMIT 1`, [S1.id]);
        const oct = monthWindow(2026, 10), nov = monthWindow(2026, 11);
        const before = { oct: await truthMoney(smile.tenant_id, S1.id, oct.from, oct.to), day: await truthMoney(smile.tenant_id, S1.id, new Date('2026-10-31T00:00:00+03:00'), oct.to) };
        await query(`INSERT INTO session_payments (session_id, amount, note, tenant_id, branch_id, currency_code, created_at) VALUES
            ($1, 1111, $2, $3, $4, 'IQD', '2026-10-31T23:59:59+03:00'), ($1, 2222, $2, $3, $4, 'IQD', '2026-11-01T00:00:00+03:00')`, [s.id, MARK, smile.tenant_id, S1.id]);
        await query(`INSERT INTO monthly_expenses (created_by, tenant_id, branch_id, type, amount, expense_date, currency_code) VALUES ($1, $2, $3, $4, 3333, '2026-10-31', 'IQD')`, [smile.manager.id, smile.tenant_id, S1.id, MARK]);
        try {
            const pOct = (await getPdf(`/api/reports/monthly/pdf?month=2026-10-01`, S1.manager)).text;
            expect(pOct).toContain(`Sessions ${fmt(before.oct.IQD.sessions + 1111)} IQD`);
            const day = (await getPdf(`/api/reports/monthly/pdf?from=2026-10-31&to=2026-10-31`, S1.manager)).text;
            expect(day).toContain(`Sessions ${fmt((before.day.IQD?.sessions ?? 0) + 1111)} IQD`);
            const novTruth = await truthMoney(smile.tenant_id, S1.id, nov.from, new Date());
            const pNov = (await getPdf(`/api/reports/monthly/pdf?month=2026-11-01`, S1.manager)).text;
            expect(pNov).toContain(`Sessions ${fmt(novTruth.IQD.sessions)} IQD`);
            const expOct = await truthExpenses(smile.tenant_id, S1.id, oct.first, oct.next);
            expect(pOct).toContain(`Expense ${fmt(expOct.IQD)} IQD`);
        } finally {
            await query(`DELETE FROM session_payments WHERE note = $1`, [MARK]);
            await query(`DELETE FROM monthly_expenses WHERE type = $1`, [MARK]);
        }
    });

    it('the PDF period line is readable: "Oct 1, 2026 – Oct 31, 2026" (en dash; not "! Nov 1, 2026")', async () => {
        const { text } = await getPdf(`/api/reports/monthly/pdf?month=2026-10-01`, S1.manager);
        expect(text).toContain('Oct 1, 2026 \u0096 Oct 31, 2026'); // \u0096 = the en dash in the PDF's font encoding
        const feb = (await getPdf(`/api/reports/monthly/pdf?month=2026-02-01`, S1.manager)).text;
        expect(feb).toContain('Feb 1, 2026 \u0096 Feb 28, 2026');
        const custom = (await getPdf(`/api/reports/monthly/pdf?from=2026-10-05&to=2026-10-20`, S1.manager)).text;
        expect(custom).toContain('Oct 5, 2026 \u0096 Oct 20, 2026');
    });

    it('the doctor PDF does not print "Dr. Dr." (and still adds "Dr." to a name without it)', async () => {
        const d = S1.doctors[0];
        const { text } = await getPdf(`/api/docs/report/pdf?month=2026-10-01`, d);
        expect(text).not.toContain('Dr. Dr.');
        const p = await one(`SELECT full_name FROM profiles WHERE user_id = $1`, [d.id]);
        await query(`UPDATE profiles SET full_name = 'Karwan Aziz' WHERE user_id = $1`, [d.id]);
        try {
            expect((await getPdf(`/api/docs/report/pdf?month=2026-10-01`, d)).text).toContain('Dr. Karwan Aziz');
        } finally {
            await query(`UPDATE profiles SET full_name = $2 WHERE user_id = $1`, [d.id, p.full_name]);
        }
    });

    it('two doctors with the SAME name stay two lines in the branch PDF (each with his own count)', async () => {
        const [dA, dB] = S1.doctors;
        const p = await one(`SELECT full_name FROM profiles WHERE user_id = $1`, [dB.id]);
        const nameA = (await one(`SELECT full_name FROM profiles WHERE user_id = $1`, [dA.id])).full_name;
        await query(`UPDATE profiles SET full_name = $2 WHERE user_id = $1`, [dB.id, nameA]);
        try {
            const M = MONTHS[MONTHS.length - 1];
            const counts = await all(`SELECT doctor_id, count(*) n FROM appointments WHERE branch_id = $1 AND NOT is_deleted AND scheduled_start >= $2 AND scheduled_start < $3 GROUP BY 1 ORDER BY 2 DESC`, [S1.id, M.from, M.to]);
            const { text } = await getPdf(`/api/reports/monthly/pdf?month=${M.first}`, S1.manager);
            expect(text).toContain(`Appointments for Each Doctor ${nameA} ${counts[0].n} ${nameA} ${counts[1].n} `);
        } finally {
            await query(`UPDATE profiles SET full_name = $2 WHERE user_id = $1`, [dB.id, p.full_name]);
        }
    });
});
