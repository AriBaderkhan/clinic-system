// Crowded MADE-UP test clinics for the local test database.
//   node tests/seed/seedTestClinics.js
// 1. Removes the previous run's test clinics (only "Test Smile" and "Test Care").
// 2. Creates the clinics, branches, staff and treatments with the APP'S OWN services (same as a real sign-up).
// 3. Writes 12 months of history (patients, visits, works, payments, plans, discounts, expenses)
//    following the same money rules the app uses, then checks that every total adds up.
// Same input -> same data every run (fixed random seed), so test results are repeatable.
import '../setup/testDb.js'; // safety lock: localhost + "_test" database only
import pool from '../../db_connection.js';
import adminPlatformService from '../../services/adminPlatformService.js';
import tenantService from '../../services/tenantService.js';
import userService from '../../services/userService.js';
import worksService from '../../services/worksService.js';
import { NAMES, NAME_STYLES, REFERRALS, ALLERGIES, CHRONIC, COMPLAINTS, CANCEL_REASONS } from './fakeNames.js';

export const TEST_PASSWORD = 'Test12345!';
const DAY = 86400000;
const HISTORY_DAYS = 365;
const FUTURE_DAYS = 14;
const PATIENTS_PER_BRANCH = 280;
const BAGHDAD_OFFSET_HOURS = 3;
const ROLE = { branch_manager: 2, doctor: 3, reception: 4 };

// prices of the IQD clinics; a USD branch uses them divided by USD_RATE
const USD_RATE = 1300;
const CATALOG = [
    { code: 'DIAGNOSIS', name: 'Diagnosis', min_price: 5000 },
    { code: 'FILLING', name: 'Filling', min_price: 40000 },
    { code: 'EXTRACTION', name: 'Extraction', min_price: 20000 },
    { code: 'SCALING_POLISH', name: 'Scaling and polishing', min_price: 40000, is_whole_mouth: true },
    { code: 'CROWN_PFM', name: 'Crown PFM', min_price: 100000 },
    { code: 'CROWN_ZIR', name: 'Crown Zirconia', min_price: 170000 },
    { code: 'CROWN_EMAX', name: 'Crown Emax', min_price: 250000 },
    { code: 'VENEER', name: 'Veneer', min_price: 220000 },
    { code: 'LASER', name: 'Laser', min_price: 180000, is_whole_mouth: true },
    { code: 'DENTURE', name: 'Denture', min_price: 400000, is_whole_mouth: true },
    { code: 'FOLLOW_UP', name: 'Follow Up', min_price: 0 },
    { code: 'RCT', name: 'Root Canal session', min_price: 120000, is_plan: true, visits: 3 },
    { code: 'RE_RCT', name: 'Re Root Canal session', min_price: 140000, is_plan: true, visits: 3 },
    { code: 'IMPLANT', name: 'Implant', min_price: 400000, is_plan: true, visits: 4 },
    { code: 'ORTHO', name: 'Orthodontics', min_price: 1300000, is_plan: true, is_whole_mouth: true, visits: 12 },
];

const CLINICS = [
    {
        name: 'Test Smile', domain: 'smile.example.com', plan_id: 2, currency: 'IQD', seed: 101,
        branches: [
            { name: 'Smile Erbil Center', location: 'Erbil' },
            { name: 'Smile Duhok', location: 'Duhok' },
            { name: 'Smile Sulaimani', location: 'Sulaimani' },
        ],
    },
    {
        name: 'Test Care', domain: 'care.example.com', plan_id: 11, currency: 'IQD', seed: 202,
        branches: [
            { name: 'Care Erbil', location: 'Erbil' },
            { name: 'Care Kirkuk USD', location: 'Kirkuk', currency_code: 'USD' },
        ],
    },
];

// ---------- small helpers ----------
function makeRandom(seed) {
    let a = seed;
    const next = () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        next,
        chance: (p) => next() < p,
        between: (min, max) => min + Math.floor(next() * (max - min + 1)),
        pick: (list) => list[Math.floor(next() * list.length)],
        weighted: (pairs) => {
            let r = next();
            for (const [value, weight] of pairs) { if ((r -= weight) < 0) return value; }
            return pairs[pairs.length - 1][0];
        },
    };
}

// a Baghdad wall-clock time on a given UTC day -> real moment
const baghdadTime = (dayStart, hour, minute) => new Date(dayStart + ((hour - BAGHDAD_OFFSET_HOURS) * 60 + minute) * 60000);

async function nextIds(client, table, count) {
    if (count === 0) return [];
    const { rows } = await client.query(
        `SELECT nextval(pg_get_serial_sequence($1, 'id'))::int AS id FROM generate_series(1, $2)`, [`public.${table}`, count]);
    return rows.map((r) => r.id);
}

// many rows in a few INSERTs (Postgres allows ~65k parameters per query)
async function insertRows(client, table, columns, rows) {
    const perQuery = Math.floor(60000 / columns.length);
    for (let start = 0; start < rows.length; start += perQuery) {
        const chunk = rows.slice(start, start + perQuery);
        const values = [];
        const placeholders = chunk.map((row, r) =>
            `(${columns.map((col, c) => { values.push(row[col] ?? null); return `$${r * columns.length + c + 1}`; }).join(',')})`);
        await client.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders.join(',')}`, values);
    }
}

// ---------- 1. remove the previous run ----------
async function removeOldTestClinics() {
    const names = CLINICS.map((c) => c.name);
    const { rows: tenants } = await pool.query('SELECT id FROM tenants WHERE name = ANY($1)', [names]);
    if (!tenants.length) return 0;
    const tenantIds = tenants.map((t) => Number(t.id));
    const { rows: users } = await pool.query('SELECT id FROM users WHERE tenant_id = ANY($1)', [tenantIds]);
    const userIds = users.map((u) => Number(u.id));

    const { rows: cols } = await pool.query(`
        SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name IN ('tenant_id', 'user_id')
           AND table_name NOT IN ('tenants') ORDER BY table_name`);
    const steps = cols.map((c) => ({ table: c.table_name, column: c.column_name, ids: c.column_name === 'tenant_id' ? tenantIds : userIds }));
    steps.push({ table: 'tenants', column: 'id', ids: tenantIds });

    // delete in passes: a row blocked by a link is retried after the rows pointing at it are gone
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let left = steps;
        for (let pass = 0; pass < 15 && left.length; pass++) {
            const blocked = [];
            for (const s of left) {
                await client.query('SAVEPOINT step');
                try {
                    await client.query(`DELETE FROM ${s.table} WHERE ${s.column} = ANY($1::bigint[])`, [s.ids]);
                    await client.query('RELEASE SAVEPOINT step');
                } catch (err) {
                    await client.query('ROLLBACK TO SAVEPOINT step');
                    if (err.code !== '23503') throw err;
                    blocked.push(s);
                }
            }
            left = blocked;
        }
        if (left.length) throw new Error('Could not remove old test clinics: ' + left.map((s) => s.table).join(', '));
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return tenantIds.length;
}

// ---------- 2. clinics, branches, staff, treatments (through the app's services) ----------
async function createClinic(clinic) {
    const mail = (who) => `${who}@${clinic.domain}`;
    const { tenant_id } = await adminPlatformService.register({
        tenant_name: clinic.name,
        timezone: 'Asia/Baghdad',
        currency: clinic.currency,
        manager_email: mail('manager'),
        manager_password: TEST_PASSWORD,
        manager_name: `${clinic.name} Manager`,
        phone: '07500000000',
        address: 'Test address',
        plan_id: clinic.plan_id,
        billing_period: 'monthly',
    });

    const branches = [];
    for (const [i, b] of clinic.branches.entries()) {
        const n = i + 1;
        const branch = await tenantService.createBranch(tenant_id, { name: b.name, location: b.location, currency_code: b.currency_code });
        const branch_id = Number(branch.id);
        const { rows: [specialty] } = await pool.query(
            `INSERT INTO specialties (tenant_id, branch_id, name, uses_teeth) VALUES ($1, $2, 'Dental', true) RETURNING id`, [tenant_id, branch_id]);

        const staff = async (who, role_id, full_name, room) =>
            (await userService.create({ branch_id, full_name, email: mail(who), password: TEST_PASSWORD, role_id, phone: '07500000001', address: b.location, room, is_active: true }, tenant_id)).id;
        const manager = await staff(`bm${n}`, ROLE.branch_manager, `${b.name} Manager`);
        const doctors = [await staff(`doc${n}a`, ROLE.doctor, `Dr. ${b.location} A`, 1), await staff(`doc${n}b`, ROLE.doctor, `Dr. ${b.location} B`, 2)];
        const reception = await staff(`rec${n}`, ROLE.reception, `${b.location} Reception`);
        await pool.query('UPDATE doctors SET specialty_id = $1 WHERE id = ANY($2::int[])', [specialty.id, doctors]);

        const isUsd = b.currency_code === 'USD';
        const price = (iqd) => (isUsd ? (iqd === 0 ? 0 : Math.max(5, Math.round(iqd / USD_RATE / 5) * 5)) : iqd);
        const works = [];
        for (const w of CATALOG) {
            const created = await worksService.create({
                code: w.code, name: w.name, min_price: price(w.min_price), allow_installments: !!w.is_plan, min_installment_amount: null,
                is_active: true, is_plan: !!w.is_plan, is_whole_mouth: !!w.is_whole_mouth, specialty_id: Number(specialty.id), one_visit: true,
            }, tenant_id, branch_id);
            works.push({ ...w, id: Number(created.id), min_price: price(w.min_price) });
        }

        const { rows: discounts } = await pool.query(`
            INSERT INTO discounts (tenant_id, branch_id, name, type, value) VALUES
              ($1, $2, 'Student 10%', 'percent', 10), ($1, $2, 'Family', 'fixed', $3)
            RETURNING id, type, value`, [tenant_id, branch_id, price(10000)]);

        branches.push({ branch_id, n, isUsd, step: isUsd ? 5 : 5000, manager, doctors, reception, works, discounts });
    }
    return { tenant_id: Number(tenant_id), branches };
}

// ---------- 3. twelve months of history (direct inserts, same money rules as the app) ----------
function fakePatient(rnd, phones) {
    const style = rnd.weighted(NAME_STYLES);
    const name = `${rnd.pick(NAMES[style].first)} ${rnd.pick(NAMES[style].last)}`;
    let phone;
    do { phone = rnd.pick(['0750', '0751', '0770', '0771']) + String(rnd.between(1000000, 9999999)); } while (phones.has(phone));
    phones.add(phone);
    return {
        name, phone, age: rnd.between(4, 80), gender: rnd.chance(0.5) ? 'male' : 'female',
        address: rnd.pick(['Erbil', 'Duhok', 'Sulaimani', 'Kirkuk', null]),
        allergies: rnd.pick(ALLERGIES), chronic_diseases: rnd.pick(CHRONIC), referral_source: rnd.pick(REFERRALS),
    };
}

function buildBranchHistory(rnd, tenant_id, b, now) {
    const t = { tenant_id, branch_id: b.branch_id };
    const roundTo = (amount) => Math.max(b.step, Math.round(amount / b.step) * b.step);
    const normalWorks = b.works.filter((w) => !w.is_plan);
    const planWorks = b.works.filter((w) => w.is_plan);
    const out = { patients: [], appointments: [], sessions: [], session_works: [], session_payments: [], treatment_plans: [], treatment_payments: [], monthly_expenses: [] };

    const phones = new Set();
    const patients = Array.from({ length: PATIENTS_PER_BRANCH }, () => ({ ...fakePatient(rnd, phones), ...t, created_by: b.reception, firstVisit: null }));
    const activePlans = []; // { plan, patient, doctor, visitsLeft, perVisit, nextDue }
    const todayStart = Math.floor(now / DAY) * DAY;

    for (let d = HISTORY_DAYS; d >= -FUTURE_DAYS; d--) {
        const dayStart = todayStart - d * DAY;
        if (new Date(dayStart).getUTCDay() === 5) continue; // Friday: clinics closed
        for (const doctor of b.doctors) {
            const due = activePlans.filter((p) => p.doctor === doctor && p.nextDue <= dayStart && !p.booked);
            const count = d < 0 ? rnd.between(2, 4) : rnd.between(5, 9);
            for (let slot = 0; slot < count; slot++) {
                const plan = slot < 3 ? due[slot] : undefined;
                const patientIdx = plan ? plan.patientIdx : rnd.between(0, patients.length - 1);
                const start = baghdadTime(dayStart, 10 + slot, rnd.pick([0, 15, 30, 45]));
                const appt = { ...t, patientIdx, doctor_id: doctor, scheduled_start: start, created_by: b.reception, updated_by: b.reception,
                    created_at: new Date(start.getTime() - rnd.between(1, 72) * 3600000), appointment_type: rnd.weighted([['normal', 0.85], ['walk_in', 0.1], ['urgent', 0.05]]),
                    complaint: rnd.pick(COMPLAINTS), status: 'scheduled' };
                if (plan) plan.booked = true;
                if (!patients[patientIdx].firstVisit || start < patients[patientIdx].firstVisit) patients[patientIdx].firstVisit = start;

                const isPast = d > 0 || (d === 0 && slot < count - 3);
                if (d === 0 && slot === count - 3) appt.status = 'in_progress';
                else if (d === 0 && slot === count - 2) appt.status = 'checked_in';
                if (appt.status !== 'scheduled' || !isPast) {
                    if (appt.status === 'in_progress') Object.assign(appt, { check_in_time: start, started_at: start });
                    if (appt.status === 'checked_in') appt.check_in_time = start;
                    out.appointments.push(appt);
                    continue;
                }
                appt.status = rnd.weighted([['completed', 0.88], ['cancelled', 0.08], ['no_show', 0.04]]);
                if (appt.status === 'cancelled') appt.cancel_reason = rnd.pick(CANCEL_REASONS);
                if (appt.status !== 'completed') {
                    if (plan) plan.booked = false; // the plan visit did not happen: book it again later
                    out.appointments.push(appt);
                    continue;
                }

                const finished = new Date(start.getTime() + rnd.between(15, 50) * 60000);
                Object.assign(appt, { check_in_time: start, started_at: start, finished_at: finished, updated_by: doctor });
                out.appointments.push(appt);
                addVisit({ appt, plan, doctor, finished, ageDays: d });
                if (plan) plan.booked = false;
            }
        }
    }

    function addVisit({ appt, plan, doctor, finished, ageDays }) {
        const session = { ...t, appt, created_by: doctor, updated_by: doctor, created_at: finished, updated_at: finished, notes: null, next_plan: null,
            total: 0, min_total: 0, total_paid: 0, discount_amount: 0, discount_id: null, is_paid: false, is_settled: false };
        out.sessions.push(session);
        const work = (w, extra = {}) => {
            const quantity = w.is_whole_mouth ? 1 : rnd.weighted([[1, 0.85], [2, 0.15]]);
            const row = { ...t, session, work_id: w.id, quantity, min_unit_price: w.min_price, unit_price: w.min_price,
                total_min_price: w.min_price * quantity, total_price: w.min_price * quantity, created_at: finished,
                tooth_number: w.is_whole_mouth ? null : rnd.pick([11, 12, 16, 21, 26, 36, 37, 46, 47]),
                arch: w.is_whole_mouth && rnd.chance(0.5) ? rnd.pick(['upper', 'lower']) : null, plan: null, ...extra };
            out.session_works.push(row);
            return row;
        };

        // continue a plan the patient already has
        if (plan) {
            work(plan.work, { plan: plan.row, quantity: 1, total_min_price: plan.work.min_price, total_price: plan.work.min_price });
            plan.visitsLeft--;
            payPlan(plan, session, finished, ageDays);
            if (plan.visitsLeft <= 0) {
                plan.row.status = 'completed'; plan.row.is_completed = true; plan.row.updated_at = finished;
                activePlans.splice(activePlans.indexOf(plan), 1);
            } else plan.nextDue = finished.getTime() + (plan.work.code === 'ORTHO' ? 28 : 7) * DAY;
        } else if (rnd.chance(0.07)) {
            // start a new plan (counts on the plan, not on the visit total)
            const pw = rnd.weighted([[planWorks[0], 0.5], [planWorks[1], 0.15], [planWorks[2], 0.15], [planWorks[3], 0.2]]);
            const agreed = roundTo(pw.min_price * (1 + rnd.next() * 0.4));
            const row = { ...t, patientIdx: appt.patientIdx, type: pw.code.toLowerCase(), agreed_total: agreed, total_paid: 0, is_paid: false,
                is_completed: false, status: 'active', created_by: doctor, created_at: finished, updated_at: finished };
            out.treatment_plans.push(row);
            const p = { row, work: pw, patientIdx: appt.patientIdx, doctor, visitsLeft: pw.visits, perVisit: roundTo(agreed / pw.visits), nextDue: 0, booked: false };
            work(pw, { plan: row, quantity: 1, total_min_price: pw.min_price, total_price: pw.min_price });
            p.visitsLeft--;
            payPlan(p, session, finished, ageDays);
            p.nextDue = finished.getTime() + (pw.code === 'ORTHO' ? 28 : 7) * DAY;
            activePlans.push(p);
        }

        // regular treatments of this visit
        const howMany = rnd.weighted([[0, plan ? 0.6 : 0], [1, 0.55], [2, 0.3], [3, 0.15]]);
        for (let i = 0; i < howMany; i++) work(rnd.pick(normalWorks));
        const normal = out.session_works.filter((w) => w.session === session && !w.plan);
        session.total = normal.reduce((s, w) => s + w.total_price, 0);
        session.min_total = normal.reduce((s, w) => s + w.total_min_price, 0);
        payVisit(session, finished, ageDays);
    }

    function payVisit(session, finished, ageDays) {
        if (session.total <= 0) { session.is_paid = true; return; }
        const recent = ageDays < 30;
        const how = rnd.weighted(recent
            ? [['full', 0.6], ['two', 0.08], ['discount', 0.05], ['partial', 0.12], ['unpaid', 0.15]]
            : [['full', 0.8], ['two', 0.08], ['discount', 0.05], ['settled', 0.03], ['unpaid', 0.02], ['partial', 0.02]]);
        const pay = (amount, at) => {
            if (amount <= 0) return;
            out.session_payments.push({ ...t, session, amount, created_by: b.reception, created_at: at });
            session.total_paid += amount;
        };
        const later = (days) => new Date(Math.min(finished.getTime() + days * DAY, now - 3600000));
        if (how === 'full') pay(session.total, finished);
        if (how === 'two') { const first = roundTo(session.total / 2); pay(Math.min(first, session.total), finished); pay(session.total - session.total_paid, later(rnd.between(3, 20))); }
        if (how === 'partial') pay(Math.min(roundTo(session.total / 2), session.total), finished);
        if (how === 'settled') { pay(Math.min(roundTo(session.total * 0.8), session.total), finished); session.is_settled = true; }
        if (how === 'discount') {
            const disc = rnd.pick(b.discounts);
            const raw = disc.type === 'percent' ? Math.round((session.total * Number(disc.value)) / 100) : Number(disc.value);
            session.discount_amount = Math.min(raw, session.total);
            session.discount_id = disc.id;
            pay(session.total - session.discount_amount, finished);
        }
        session.is_paid = session.is_settled || session.total_paid + session.discount_amount >= session.total;
    }

    function payPlan(p, session, at, ageDays) {
        if (ageDays < 30 && rnd.chance(0.3)) return; // some recent plan visits are still owed
        const left = p.row.agreed_total - p.row.total_paid;
        const amount = p.visitsLeft <= 0 ? left : Math.min(p.perVisit, left);
        if (amount <= 0) return;
        out.treatment_payments.push({ ...t, plan: p.row, session, amount, created_by: b.reception, created_at: at });
        p.row.total_paid += amount;
        p.row.is_paid = p.row.total_paid >= p.row.agreed_total;
    }

    // patients were registered just before their first visit
    for (const p of patients) p.created_at = p.updated_at = new Date((p.firstVisit ? p.firstVisit.getTime() : todayStart - rnd.between(1, HISTORY_DAYS) * DAY) - DAY);
    out.patients = patients;

    // monthly expenses
    for (let m = 0; m < 12; m++) {
        const date = new Date(todayStart - m * 30 * DAY);
        for (const [type, iqd] of [['Salary', 2500000], ['Electric', 300000], ['Materials', 900000], ['Tax', 150000], ['Other', 100000]]) {
            const amount = roundTo((b.isUsd ? iqd / USD_RATE : iqd) * (0.8 + rnd.next() * 0.4));
            out.monthly_expenses.push({ ...t, type, amount, expense_date: date.toISOString().slice(0, 10), note: null, created_by: b.manager, created_at: date, updated_at: date });
        }
    }
    return out;
}

async function writeBranchHistory(client, h) {
    const assign = async (table, rows) => { const ids = await nextIds(client, table, rows.length); rows.forEach((r, i) => { r.id = ids[i]; }); };
    await assign('patients', h.patients);
    await assign('appointments', h.appointments);
    await assign('sessions', h.sessions);
    await assign('treatment_plans', h.treatment_plans);
    for (const a of h.appointments) a.patient_id = h.patients[a.patientIdx].id;
    for (const p of h.treatment_plans) p.patient_id = h.patients[p.patientIdx].id;
    for (const s of h.sessions) s.appointment_id = s.appt.id;
    for (const w of h.session_works) { w.session_id = w.session.id; w.treatment_plan_id = w.plan ? w.plan.id : null; }
    for (const p of h.session_payments) p.session_id = p.session.id;
    for (const p of h.treatment_payments) { p.session_id = p.session.id; p.treatment_plan_id = p.plan.id; }

    await insertRows(client, 'patients', ['id', 'name', 'phone', 'age', 'gender', 'address', 'allergies', 'chronic_diseases', 'referral_source', 'created_by', 'created_at', 'updated_at', 'tenant_id', 'branch_id'], h.patients);
    await insertRows(client, 'appointments', ['id', 'patient_id', 'doctor_id', 'scheduled_start', 'status', 'check_in_time', 'started_at', 'finished_at', 'cancel_reason', 'created_by', 'updated_by', 'created_at', 'updated_at', 'appointment_type', 'complaint', 'tenant_id', 'branch_id'],
        h.appointments.map((a) => ({ ...a, updated_at: a.finished_at || a.created_at })));
    await insertRows(client, 'treatment_plans', ['id', 'patient_id', 'type', 'agreed_total', 'total_paid', 'is_paid', 'is_completed', 'status', 'created_by', 'created_at', 'updated_at', 'tenant_id', 'branch_id'], h.treatment_plans);
    await insertRows(client, 'sessions', ['id', 'appointment_id', 'notes', 'next_plan', 'created_by', 'updated_by', 'created_at', 'updated_at', 'min_total', 'total', 'total_paid', 'is_paid', 'is_settled', 'discount_id', 'discount_amount', 'tenant_id', 'branch_id'], h.sessions);
    await insertRows(client, 'session_works', ['session_id', 'work_id', 'quantity', 'tooth_number', 'min_unit_price', 'unit_price', 'total_min_price', 'total_price', 'created_at', 'treatment_plan_id', 'arch', 'tenant_id', 'branch_id'], h.session_works);
    await insertRows(client, 'session_payments', ['session_id', 'amount', 'created_by', 'created_at', 'tenant_id', 'branch_id'], h.session_payments);
    await insertRows(client, 'treatment_payments', ['treatment_plan_id', 'session_id', 'amount', 'created_by', 'created_at', 'tenant_id', 'branch_id'], h.treatment_payments);
    await insertRows(client, 'monthly_expenses', ['type', 'amount', 'expense_date', 'note', 'created_by', 'created_at', 'updated_at', 'tenant_id', 'branch_id'], h.monthly_expenses);
}

// ---------- 4. prove the money adds up (same rules as the app) ----------
async function checkIntegrity(tenantIds) {
    const checks = {
        'visit total = its regular treatments': `
            SELECT count(*) FROM sessions s WHERE s.tenant_id = ANY($1) AND s.total <> (
              SELECT COALESCE(sum(total_price), 0) FROM session_works w WHERE w.session_id = s.id AND w.treatment_plan_id IS NULL)`,
        'visit paid = its payments': `
            SELECT count(*) FROM sessions s WHERE s.tenant_id = ANY($1) AND s.total_paid <> (
              SELECT COALESCE(sum(amount), 0) FROM session_payments p WHERE p.session_id = s.id)`,
        'visit "paid" flag follows the rule': `
            SELECT count(*) FROM sessions WHERE tenant_id = ANY($1)
               AND is_paid <> (is_settled OR total_paid + discount_amount >= total)`,
        'plan paid = its payments, never above the agreed price': `
            SELECT count(*) FROM treatment_plans tp WHERE tp.tenant_id = ANY($1) AND (tp.total_paid > tp.agreed_total OR tp.total_paid <> (
              SELECT COALESCE(sum(amount), 0) FROM treatment_payments p WHERE p.treatment_plan_id = tp.id))`,
        'plan "paid" flag follows the rule': `
            SELECT count(*) FROM treatment_plans WHERE tenant_id = ANY($1) AND is_paid <> (total_paid >= agreed_total)`,
        'every completed visit has exactly one session': `
            SELECT count(*) FROM appointments a WHERE a.tenant_id = ANY($1) AND (a.status = 'completed') <> EXISTS (SELECT 1 FROM sessions s WHERE s.appointment_id = a.id)`,
        'no row points to another clinic': `
            SELECT count(*) FROM appointments a JOIN patients p ON p.id = a.patient_id
             WHERE a.tenant_id = ANY($1) AND (p.tenant_id <> a.tenant_id OR p.branch_id <> a.branch_id)`,
    };
    const failed = [];
    for (const [label, sql] of Object.entries(checks)) {
        const bad = Number((await pool.query(sql, [tenantIds])).rows[0].count);
        console.log(`${bad === 0 ? 'OK  ' : 'FAIL'} ${label}${bad ? ` (${bad} rows)` : ''}`);
        if (bad) failed.push(label);
    }
    return failed;
}

async function main() {
    const removed = await removeOldTestClinics();
    console.log(`removed ${removed} old test clinic(s)`);
    const now = Date.now();
    const tenantIds = [];
    for (const clinic of CLINICS) {
        const created = await createClinic(clinic);
        tenantIds.push(created.tenant_id);
        const rnd = makeRandom(clinic.seed);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const b of created.branches) await writeBranchHistory(client, buildBranchHistory(rnd, created.tenant_id, b, now));
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
        console.log(`created "${clinic.name}" (tenant ${created.tenant_id}) with ${created.branches.length} branches`);
    }

    const { rows } = await pool.query(`
        SELECT t.name AS clinic, b.name AS branch,
               (SELECT count(*) FROM patients x WHERE x.branch_id = b.id) AS patients,
               (SELECT count(*) FROM appointments x WHERE x.branch_id = b.id) AS appointments,
               (SELECT count(*) FROM sessions x WHERE x.branch_id = b.id) AS visits,
               (SELECT count(*) FROM session_payments x WHERE x.branch_id = b.id) AS payments,
               (SELECT count(*) FROM treatment_plans x WHERE x.branch_id = b.id) AS plans
          FROM branches b JOIN tenants t ON t.id = b.tenant_id WHERE t.id = ANY($1) ORDER BY b.id`, [tenantIds]);
    console.table(rows);
    const failed = await checkIntegrity(tenantIds);
    if (failed.length) throw new Error('Seed data does not add up: ' + failed.join('; '));
    console.log(`login for every test user: password "${TEST_PASSWORD}" (e.g. manager@smile.example.com, rec1@smile.example.com, doc1a@care.example.com)`);
}

main()
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => pool.end());
