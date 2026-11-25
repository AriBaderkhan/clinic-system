// PART 1 — Clinic / branch separation.
// One clinic must never read, change or delete another clinic's data, and one branch never another branch's
// (unless a patient was shared on purpose).
//
// "Victim" = branch 1 of the made-up clinic "Test Smile". Its data is created through the API and marked "ZZVICTIM".
// "Attackers":
//   - the clinic manager of "Test Care" (another clinic, has almost every permission)
//   - the branch manager of "Test Smile" branch 2 (same clinic, another branch)
// Every attack must be refused (4xx), must not return victim data, and must change nothing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { call, one, all, query, loadClinic, newTestVisit, removeTestVisits } from './helpers/testApp.js';

const MARK = 'ZZVICTIM';
const VISIT_MARK = 'test-tenant-separation';
const startedAt = new Date();
let smile, care, S1, S2, C1, v, careVisit, careSession;

const ok = (r) => r.status >= 200 && r.status < 300;
const leaks = (r) => JSON.stringify(r.body ?? r.text ?? '').includes(MARK);
const hasData = (r) => { const d = r.body?.data; return d != null && !(Array.isArray(d) && d.length === 0); };
// refused, or answered with nothing at all; never victim data (changes are caught by the fingerprint)
const breach = (r) => leaks(r) || (ok(r) && hasData(r));
const tomorrow = () => new Date(Date.now() + 86400000).toISOString();

// fingerprint of every victim row, to prove attacks changed nothing
async function victimFingerprint() {
    const rows = await all(`
        SELECT 'patient' k, md5(row_to_json(p)::text) h FROM patients p WHERE id = $1
        UNION ALL SELECT 'appointment', md5(row_to_json(a)::text) FROM appointments a WHERE id = $2
        UNION ALL SELECT 'session', md5(row_to_json(s)::text) FROM sessions s WHERE id = $3
        UNION ALL SELECT 'plan', md5(row_to_json(tp)::text) FROM treatment_plans tp WHERE id = $4
        UNION ALL SELECT 'payments', md5(string_agg(row_to_json(sp)::text, '' ORDER BY id)) FROM session_payments sp WHERE session_id = $3
        UNION ALL SELECT 'plan payments', md5(string_agg(row_to_json(x)::text, '' ORDER BY id)) FROM treatment_payments x WHERE treatment_plan_id = $4
        UNION ALL SELECT 'works', md5(string_agg(row_to_json(w)::text, '' ORDER BY id)) FROM session_works w WHERE session_id = $3
        UNION ALL SELECT 'work', md5(row_to_json(wc)::text) FROM work_catalog wc WHERE id = $5
        UNION ALL SELECT 'discount', md5(row_to_json(d)::text) FROM discounts d WHERE id = $6
        UNION ALL SELECT 'expense', md5(row_to_json(e)::text) FROM monthly_expenses e WHERE id = $7
        UNION ALL SELECT 'specialty', md5(row_to_json(sp)::text) FROM specialties sp WHERE id = $8
        UNION ALL SELECT 'floor', md5(row_to_json(f)::text) FROM floors f WHERE id = $9
        UNION ALL SELECT 'lab', md5(row_to_json(l)::text) FROM labs l WHERE id = $10
        UNION ALL SELECT 'lab order', md5(row_to_json(o)::text) FROM lab_orders o WHERE id = $11
        UNION ALL SELECT 'role', md5(row_to_json(r)::text) FROM roles r WHERE id = $12
        UNION ALL SELECT 'role ticks', md5(string_agg(row_to_json(b)::text, '' ORDER BY b.permission_id)) FROM branch_role_permissions b WHERE role_id = $12 AND branch_id = $15
        UNION ALL SELECT 'reception', md5(row_to_json(u)::text) FROM users u WHERE id = $13
        UNION ALL SELECT 'reception profile', md5(row_to_json(pr)::text) FROM profiles pr WHERE user_id = $13
        UNION ALL SELECT 'reception roles', md5(string_agg(row_to_json(x)::text, '' ORDER BY id)) FROM user_branch_roles x WHERE user_id = $13
        UNION ALL SELECT 'doctor', md5(row_to_json(d)::text) FROM doctors d WHERE id = $14
        UNION ALL SELECT 'doctor extras', md5(string_agg(row_to_json(x)::text, '' ORDER BY work_id)) FROM doctor_extra_works x WHERE doctor_id = $14
        UNION ALL SELECT 'branch', md5(row_to_json(b)::text) FROM branches b WHERE id = $15
        UNION ALL SELECT 'shares', md5(string_agg(row_to_json(x)::text, '' ORDER BY id)) FROM patient_branch_access x WHERE patient_id = $1
        UNION ALL SELECT 'prescription', md5(string_agg(row_to_json(x)::text, '' ORDER BY id)) FROM prescriptions x WHERE appointment_id = $2`,
        [v.patient, v.appointment, v.session, v.plan, v.work, v.discount, v.expense, v.specialty, v.floor, v.lab, v.labOrder, v.role, v.reception, v.doctor, S1.id]);
    return Object.fromEntries(rows.map((r) => [r.k, r.h]));
}

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    care = await loadClinic('care.example.com');
    [S1, S2] = smile.branches;
    [C1] = care.branches;
    const boss = smile.manager; // works inside branch 1
    const created = async (r, label) => {
        if (!ok(r)) throw new Error(`setup: could not create ${label}: ${r.status} ${JSON.stringify(r.body)}`);
        return Number(r.body.data?.id ?? r.body.data?.[0]?.id ?? r.body.id);
    };
    const workOf = async (branch, where) => Number((await one(`SELECT id FROM work_catalog WHERE branch_id = $1 AND ${where} ORDER BY id LIMIT 1`, [branch.id])).id);

    // ---- victim data in Smile branch 1, created like a real user would ----
    v = { reception: S1.reception.id, doctor: S1.doctors[0].id };
    v.normalWork = await workOf(S1, `code = 'FILLING'`);
    v.rct = await workOf(S1, `code = 'RCT'`);
    v.patient = await created(await call('POST', '/api/patients', boss, { name: `${MARK} Patient`, phone: '07509990001', age: 40, gender: 'male' }), 'patient');
    v.appointment = await newTestVisit(VISIT_MARK, S1, { patient_id: v.patient, doctor_id: v.doctor });
    let r = await call('POST', `/api/appointments/${v.appointment}/completed`, boss, {
        notes: `${MARK} note`,
        works: [{ work_id: v.normalWork, quantity: 1, tooth_number: 16 }, { work_id: v.rct, quantity: 1, tooth_number: 26, agreed_total: 200000 }],
        prescription: [{ drug_name: `${MARK} Drug` }],
    });
    if (!ok(r)) throw new Error('setup: complete visit failed ' + JSON.stringify(r.body));
    v.session = Number((await one(`SELECT id FROM sessions WHERE appointment_id = $1`, [v.appointment])).id);
    v.plan = Number((await one(`SELECT treatment_plan_id AS id FROM session_works WHERE session_id = $1 AND treatment_plan_id IS NOT NULL`, [v.session])).id);
    v.planWork = Number((await one(`SELECT id FROM session_works WHERE session_id = $1 AND treatment_plan_id IS NOT NULL`, [v.session])).id);
    r = await call('POST', `/api/sessions/${v.session}/pay`, boss, { normalAmount: 10000, planPayments: [{ plan_id: v.plan, amount: 50000 }] });
    if (!ok(r)) throw new Error('setup: pay failed ' + JSON.stringify(r.body));
    v.payment = Number((await one(`SELECT id FROM session_payments WHERE session_id = $1`, [v.session])).id);
    v.planPayment = Number((await one(`SELECT id FROM treatment_payments WHERE treatment_plan_id = $1`, [v.plan])).id);

    v.work = await created(await call('POST', '/api/works', boss, { code: MARK, name: `${MARK} Work`, min_price: 1000, allow_installments: false }), 'work');
    v.discount = await created(await call('POST', '/api/discounts', boss, { name: `${MARK} Discount`, type: 'percent', value: 5 }), 'discount');
    v.expense = await created(await call('POST', '/api/monthly-expenses', boss, { type: 'Other', amount: 1000, expense_date: '2026-11-01', note: `${MARK} expense` }), 'expense');
    v.specialty = await created(await call('POST', '/api/specialties', boss, { name: `${MARK} Spec` }), 'specialty');
    v.floor = await created(await call('POST', '/api/floors', boss, { name: `${MARK} Floor` }), 'floor');
    v.lab = await created(await call('POST', '/api/labs', boss, { name: `${MARK} Lab`, treatments: [{ work_id: v.normalWork, cost: 1000 }] }), 'lab');
    v.labOrder = await created(await call('POST', '/api/labs/orders', boss, { lab_id: v.lab, patient_id: v.patient, doctor_id: v.doctor, items: [{ work_id: v.normalWork, quantity: 1 }], notes: `${MARK} order` }), 'lab order');
    v.role = await created(await call('POST', '/api/role-permissions', boss, { name: `${MARK} Role`, base_role_id: 4 }), 'role');

    // ---- the attacker clinic's own visit, used to smuggle victim IDs in request bodies ----
    careVisit = await newTestVisit(VISIT_MARK, C1);
    r = await call('POST', `/api/appointments/${careVisit}/completed`, care.manager, { works: [{ work_id: await workOf(C1, `code = 'FILLING'`), quantity: 1, tooth_number: 11 }] });
    if (!ok(r)) throw new Error('setup: care visit failed ' + JSON.stringify(r.body));
    careSession = Number((await one(`SELECT id FROM sessions WHERE appointment_id = $1`, [careVisit])).id);

    v.before = await victimFingerprint();
}, 120000);

afterAll(async () => {
    if (!v) return;
    await query(`DELETE FROM lab_order_items WHERE order_id = $1`, [v.labOrder]);
    await query(`DELETE FROM lab_orders WHERE id = $1`, [v.labOrder]);
    await query(`DELETE FROM lab_treatments WHERE lab_id = $1`, [v.lab]);
    await query(`DELETE FROM labs WHERE id = $1`, [v.lab]);
    await query(`DELETE FROM branch_role_permissions WHERE role_id = $1`, [v.role]);
    await query(`DELETE FROM role_permissions WHERE role_id = $1`, [v.role]);
    await query(`DELETE FROM roles WHERE id = $1`, [v.role]);
    await query(`DELETE FROM staff_floors WHERE floor_id = $1`, [v.floor]);
    await query(`DELETE FROM floors WHERE id = $1`, [v.floor]);
    await query(`DELETE FROM specialties WHERE id = $1`, [v.specialty]);
    await query(`DELETE FROM discounts WHERE id = $1`, [v.discount]);
    await query(`DELETE FROM monthly_expenses WHERE id = $1`, [v.expense]);
    await query(`DELETE FROM work_catalog WHERE id = $1`, [v.work]);
    // a user an attack might have created (must not exist; cleaned so a failing run leaves no junk)
    const hacked = (await all(`SELECT id FROM users WHERE email = 'hack@care.example.com'`)).map((u) => Number(u.id));
    for (const t of ['refresh_tokens', 'user_branch_roles', 'profiles', 'doctors']) {
        await query(`DELETE FROM ${t} WHERE ${t === 'doctors' ? 'id' : 'user_id'} = ANY($1)`, [hacked]);
    }
    await query(`DELETE FROM users WHERE id = ANY($1)`, [hacked]);
    // anything an attack might have written about the victim (must be nothing; cleaned so a failing run leaves no junk)
    await query(`DELETE FROM feedbacks WHERE patient_id = $1`, [v.patient]);
    await query(`DELETE FROM reminders WHERE patient_id = $1 OR appointment_id IN (SELECT id FROM appointments WHERE complaint = $2)`, [v.patient, VISIT_MARK]);
    await query(`DELETE FROM notifications WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint = $1)`, [VISIT_MARK]);
    await removeTestVisits(VISIT_MARK);
    await query(`DELETE FROM patient_branch_access WHERE patient_id = $1`, [v.patient]);
    await query(`DELETE FROM patients WHERE id = $1`, [v.patient]);
    await query(`DELETE FROM notifications WHERE tenant_id = ANY($1) AND created_at >= $2`, [[smile.tenant_id, care.tenant_id], startedAt]);
    await query(`DELETE FROM audit_logs WHERE tenant_id = ANY($1) AND created_at >= $2`, [[smile.tenant_id, care.tenant_id], startedAt]);
});

// every endpoint that takes an ID in the address, aimed at the victim
const idAttacks = () => [
    ['GET', `/api/patients/${v.patient}`],
    ['PUT', `/api/patients/${v.patient}`, { address: 'hacked' }],
    ['DELETE', `/api/patients/${v.patient}`],
    ['GET', `/api/patients/${v.patient}/appointments`],
    ['GET', `/api/patients/${v.patient}/sessions`],
    ['GET', `/api/patients/${v.patient}/payments`],
    ['GET', `/api/patients/${v.patient}/treatment-plans`],
    ['GET', `/api/patients/${v.patient}/shares`],
    ['POST', `/api/patients/${v.patient}/shares`, { branch_id: C1.id }],
    ['DELETE', `/api/patients/${v.patient}/shares/${S1.id}`],
    ['GET', `/api/appointments/${v.appointment}`],
    ['PUT', `/api/appointments/${v.appointment}`, { complaint: 'hacked', scheduled_start: tomorrow() }],
    ['DELETE', `/api/appointments/${v.appointment}`],
    ['PATCH', `/api/appointments/${v.appointment}/checked-in`],
    ['PATCH', `/api/appointments/${v.appointment}/in_progress`],
    ['POST', `/api/appointments/${v.appointment}/completed`, { works: [] }],
    ['PATCH', `/api/appointments/${v.appointment}/visit-draft`, { draft_notes: 'hacked' }],
    ['PATCH', `/api/appointments/${v.appointment}/cancelled`, { cancel_reason: 'hacked reason' }],
    ['PATCH', `/api/appointments/${v.appointment}/no_show`, { cancel_reason: 'hacked reason' }],
    ['GET', `/api/appointments/${v.appointment}/session`],
    ['GET', `/api/docs/${v.appointment}/session`],
    ['GET', `/api/docs/${v.doctor}/settings`],
    ['PUT', `/api/docs/${v.doctor}/settings`, { specialty_id: null, extra_work_ids: [] }],
    ['GET', `/api/history/session/${v.session}/details`],
    ['GET', `/api/sessions/${v.session}/normal`],
    ['PUT', `/api/sessions/${v.session}/normal`, { works: [{ work_id: v.normalWork, quantity: 5, tooth_number: 16 }] }],
    ['PATCH', `/api/sessions/${v.session}/plan-works/tooth`, { updates: [{ session_work_id: v.planWork, tooth_number: 11 }] }],
    ['DELETE', `/api/sessions/${v.session}`],
    ['POST', `/api/sessions/${v.session}/pay`, { normalAmount: 1000 }],
    ['PATCH', `/api/sessions/${v.session}/payments/${v.payment}`, { amount: 1 }],
    ['DELETE', `/api/sessions/${v.session}/payments/${v.payment}`],
    ['PATCH', `/api/sessions/${v.session}/plan-payments/${v.planPayment}`, { amount: 1 }],
    ['DELETE', `/api/sessions/${v.session}/plan-payments/${v.planPayment}`],
    ['DELETE', `/api/sessions/${v.session}/plan-works/${v.planWork}`],
    ['PATCH', `/api/sessions/${v.session}/plan-works/${v.planWork}/plan`, { treatment_plan_id: v.plan }],
    ['GET', `/api/sessions/${v.session}/images`],
    ['DELETE', `/api/sessions/${v.session}/images/1`],
    ['GET', `/api/treatment-plans/${v.plan}/sessions`],
    ['PATCH', `/api/treatment-plans/${v.plan}`, { agreed_total: 1 }],
    ['DELETE', `/api/treatment-plans/${v.plan}`],
    ['PATCH', `/api/treatment-plans/${v.plan}/sessions/${v.session}/paid`, { amount: 1 }],
    ['GET', `/api/treatment-plans/active?patient_id=${v.patient}`],
    ['GET', `/api/works/${v.work}`],
    ['PUT', `/api/works/${v.work}`, { name: 'hacked' }],
    ['DELETE', `/api/works/${v.work}`],
    ['GET', `/api/works/doctor/${v.doctor}`],
    ['PUT', `/api/discounts/${v.discount}`, { name: 'hacked' }],
    ['DELETE', `/api/discounts/${v.discount}`],
    ['PUT', `/api/specialties/${v.specialty}`, { name: 'hacked' }],
    ['DELETE', `/api/specialties/${v.specialty}`],
    ['PUT', `/api/floors/${v.floor}`, { name: 'hacked' }],
    ['DELETE', `/api/floors/${v.floor}`],
    ['PUT', `/api/floors/staff/${v.reception}`, { floor_id: null }],
    ['GET', `/api/labs/${v.lab}`],
    ['PUT', `/api/labs/${v.lab}`, { name: 'hacked' }],
    ['DELETE', `/api/labs/${v.lab}`],
    ['GET', `/api/labs/orders/${v.labOrder}`],
    ['PUT', `/api/labs/orders/${v.labOrder}`, { notes: 'hacked' }],
    ['PATCH', `/api/labs/orders/${v.labOrder}/status`, { status: 'cancelled' }],
    ['DELETE', `/api/labs/orders/${v.labOrder}`],
    ['GET', `/api/monthly-expenses/${v.expense}`],
    ['PUT', `/api/monthly-expenses/${v.expense}`, { amount: 1 }],
    ['DELETE', `/api/monthly-expenses/${v.expense}`],
    ['GET', `/api/users/${v.reception}`],
    ['PUT', `/api/users/${v.reception}`, { full_name: 'hacked' }],
    ['DELETE', `/api/users/${v.reception}`],
    ['POST', `/api/users/${v.reception}/assign`, { branch_id: C1.id, role_id: 4 }],
    ['GET', `/api/role-permissions/${v.role}`],
    ['PUT', `/api/role-permissions/${v.role}`, { permissions: [] }],
    ['PATCH', `/api/role-permissions/${v.role}`, { name: 'hacked' }],
    ['DELETE', `/api/role-permissions/${v.role}`],
    ['GET', `/api/branches/${S1.id}`],
    ['PUT', `/api/branches/${S1.id}`, { name: 'hacked' }],
    ['PUT', `/api/tenants/branches/${S1.id}`, { name: 'hacked' }],
    ['DELETE', `/api/tenants/branches/${S1.id}`],
    ['POST', `/api/tenants/switch-branch/${S1.id}`],
    ['POST', '/api/auth/switch-branch', { branch_id: S1.id }],
    ['POST', `/api/reminders/${v.appointment}/sent`, { patient_id: v.patient, language: 'en', message: 'hacked' }],
];

describe('IDs in the address: another clinic is refused everywhere', () => {
    it('every attack by the "Test Care" manager is refused, shows no victim data', async () => {
        const failures = [];
        for (const [method, path, body] of idAttacks()) {
            const r = await call(method, path, care.manager, body);
            if (breach(r)) failures.push(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
        }
        expect(failures).toEqual([]);
    });
});

describe('IDs in the address: another branch of the same clinic is refused', () => {
    it('every attack by the branch manager of "Test Smile" branch 2 is refused, shows no victim data', async () => {
        const failures = [];
        // role ticks are set per branch (branch 2 edits its OWN ticks), so role routes are tested separately below
        for (const [method, path, body] of idAttacks().filter(([, path]) => !path.startsWith('/api/role-permissions'))) {
            const r = await call(method, path, S2.manager, body);
            if (breach(r)) failures.push(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
        }
        expect(failures).toEqual([]);
    });
});

describe('custom roles across branches (clinic-wide roles, per-branch ticks)', () => {
    it('branch 2 reads and changes only ITS OWN ticks of the role; branch 1 ticks stay the same', async () => {
        const ticksOf = (branchId) => one(`SELECT md5(string_agg(permission_id::text || scope::text, ',' ORDER BY permission_id)) AS h FROM branch_role_permissions WHERE role_id = $1 AND branch_id = $2`, [v.role, branchId]);
        const branch1Before = await ticksOf(S1.id);
        expect((await call('GET', `/api/role-permissions/${v.role}`, S2.manager)).status).toBe(200);
        expect((await call('PUT', `/api/role-permissions/${v.role}`, S2.manager, { permissions: [] })).status).toBe(200);
        expect(await ticksOf(S1.id)).toEqual(branch1Before);
    });
    // decided by the owner (2026-11-24): yes — that is what a branch manager is for
    it('a branch manager of ANOTHER branch may rename a custom role the whole clinic uses (by design)', async () => {
        const before = (await one(`SELECT row_to_json(r)::text AS j FROM roles r WHERE id = $1`, [v.role])).j;
        const r = await call('PATCH', `/api/role-permissions/${v.role}`, S2.manager, { name: `${MARK} Role renamed` });
        expect(r.status).toBe(200);
        // put the whole row back exactly, inside the database (keeps the microseconds of the timestamps)
        const cols = Object.keys(JSON.parse(before)).filter((c) => c !== 'id');
        await query(`UPDATE roles SET ${cols.map((c) => `${c} = b.${c}`).join(', ')} FROM json_populate_record(NULL::roles, $1::json) b WHERE roles.id = b.id`, [before]);
    });
});

describe('IDs hidden in the request body are refused', () => {
    const smuggled = () => [
        ['book a visit for another clinic\'s patient', 'POST', '/api/appointments', { patient_id: v.patient, doctor_id: C1.doctors[0].id, scheduled_start: tomorrow() }],
        ['book a visit with another clinic\'s doctor', 'POST', '/api/appointments', { patient_id: Number(careVisitPatient), doctor_id: v.doctor, scheduled_start: tomorrow() }],
        ['pay toward another clinic\'s plan', 'POST', `/api/sessions/${careSession}/pay`, { planPayments: [{ plan_id: v.plan, amount: 1000 }] }],
        ['use another clinic\'s discount', 'POST', `/api/sessions/${careSession}/pay`, { discountId: v.discount }],
        ['edit own visit with another clinic\'s treatment', 'PUT', `/api/sessions/${careSession}/normal`, { works: [{ work_id: v.normalWork, quantity: 1, tooth_number: 11 }] }],
        ['edit own visit to continue another clinic\'s plan', 'PUT', `/api/sessions/${careSession}/normal`, { works: [{ work_id: v.rct, quantity: 1, tooth_number: 11, treatment_plan_id: v.plan }] }],
        ['lab order at another clinic\'s lab', 'POST', '/api/labs/orders', { lab_id: v.lab, items: [{ work_id: v.normalWork, quantity: 1 }] }],
        ['lab order for another clinic\'s patient', 'POST', '/api/labs/orders', { lab_id: v.lab, patient_id: v.patient, items: [{ work_id: v.normalWork, quantity: 1 }] }],
        ['own lab priced with another clinic\'s treatment', 'POST', '/api/labs', { name: 'Care hack lab', treatments: [{ work_id: v.normalWork, cost: 1 }] }],
        ['own doctor given another clinic\'s treatment', 'PUT', `/api/docs/${C1.doctors[0].id}/settings`, { specialty_id: v.specialty, extra_work_ids: [v.work] }],
        ['create a user in another clinic\'s branch', 'POST', '/api/users', { branch_id: S1.id, email: 'hack@care.example.com', password: 'abc123', confirmPassword: 'abc123', role_id: 4, full_name: 'Hack' }],
        ['move own receptionist into another clinic\'s branch', 'POST', `/api/users/${C1.reception.id}/assign`, { branch_id: S1.id, role_id: 4 }],
        ['give own user another clinic\'s custom role', 'POST', `/api/users/${C1.reception.id}/assign`, { branch_id: C1.id, role_id: v.role }],
        ['copy another clinic\'s custom role', 'POST', '/api/role-permissions', { name: 'Care hack role', base_role_id: v.role }],
        ['put own staff on another clinic\'s floor', 'PUT', `/api/floors/staff/${C1.reception.id}`, { floor_id: v.floor }],
        ['send a feedback invite to another clinic\'s patient', 'POST', '/api/feedbacks/invite', { patient_id: v.patient, language: 'en' }],
        ['dismiss another clinic\'s patient feedback', 'POST', '/api/feedbacks/dismiss', { patient_id: v.patient }],
        ['mark a reminder for another clinic\'s patient', 'POST', `/api/reminders/${careVisit}/sent`, { patient_id: v.patient, language: 'en', message: 'x' }],
    ];
    let careVisitPatient;

    it('every smuggled victim ID is refused by the "Test Care" manager', async () => {
        careVisitPatient = (await one(`SELECT patient_id FROM appointments WHERE id = $1`, [careVisit])).patient_id;
        const failures = [];
        for (const [label, method, path, body] of smuggled()) {
            const r = await call(method, path, care.manager, body);
            if (breach(r)) failures.push(`${label}: ${method} ${path} -> ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
        }
        expect(failures).toEqual([]);
    });

    it('a "Done" tick for another clinic\'s plan, sent from an own visit, is ignored', async () => {
        await call('PUT', `/api/sessions/${careSession}/normal`, care.manager, { works: [], completedPlanIds: [v.plan] });
        expect((await one(`SELECT status FROM treatment_plans WHERE id = $1`, [v.plan])).status).toBe('active');
    });
});

describe('lists and searches never show the victim', () => {
    const lists = [
        '/api/patients', `/api/patients?q=${MARK}`, `/api/patients/search?q=${MARK}`, '/api/patients/phone-check?phone=07509990001',
        '/api/appointments', `/api/appointments?q=${MARK}`, '/api/appointments/active/today',
        `/api/appointments/calendar?from=${new Date(Date.now() - 86400000).toISOString()}&to=${new Date(Date.now() + 86400000).toISOString()}`,
        '/api/sessions', `/api/sessions?q=${MARK}`, '/api/sessions/unpaid', `/api/sessions/unpaid?q=${MARK}`,
        '/api/history/payments', '/api/treatment-plans', '/api/docs', '/api/docs/active/appointments/today', '/api/docs/active/appointments/open',
        '/api/labs', `/api/labs/search?q=${MARK}`, '/api/labs/orders', '/api/monthly-expenses', '/api/monthly-expenses/available_types',
        '/api/discounts', '/api/specialties', '/api/floors', '/api/floors/staff', '/api/users', '/api/users/roles', '/api/role-permissions',
        '/api/works', '/api/notifications', '/api/reminders/upcoming', '/api/feedbacks/appointments', '/api/feedbacks/results',
        `/api/prescriptions/suggest?field=drug_name&q=${MARK}`, '/api/branches/dashboard', '/api/tenants/dashboard', '/api/tenants/branches', '/api/audit',
        '/api/patients/referral-sources',
    ];

    it('another clinic sees none of the victim data in any list', async () => {
        const leaked = [];
        for (const path of lists) {
            const r = await call('GET', path, care.manager);
            if (leaks(r)) leaked.push(`${path} -> ${r.status}`);
        }
        expect(leaked).toEqual([]);
    });

    it('another branch of the same clinic sees none of the victim data in its branch lists', async () => {
        const leaked = [];
        // drug-name suggestions are shared by the whole clinic on purpose (names only, no patient data)
        // custom roles belong to the whole clinic, so their names show in every branch (by design)
        for (const path of lists.filter((p) => !p.startsWith('/api/prescriptions/suggest') && p !== '/api/role-permissions')) {
            const r = await call('GET', path, S2.manager);
            if (leaks(r)) leaked.push(`${path} -> ${r.status}`);
        }
        expect(leaked).toEqual([]);
    });

    it('the victim branch itself DOES see its own data (the test is real)', async () => {
        const r = await call('GET', `/api/patients?q=${MARK}`, S1.manager);
        expect(r.status).toBe(200);
        expect(leaks(r)).toBe(true);
    });
});

describe('sharing a patient on purpose', () => {
    it('after sharing with branch 2, branch 2 can read the patient but another clinic still cannot', async () => {
        const share = await call('POST', `/api/patients/${v.patient}/shares`, smile.manager, { branch_id: S2.id });
        expect(share.status).toBeLessThan(300);
        expect((await call('GET', `/api/patients/${v.patient}`, S2.manager)).status).toBe(200);
        const r = await call('GET', `/api/patients/${v.patient}`, care.manager);
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(leaks(r)).toBe(false);
        // the shared branch reads, but only the home branch may change the patient
        expect((await call('PUT', `/api/patients/${v.patient}`, S2.manager, { address: 'from branch 2' })).status).toBe(403);
        await call('DELETE', `/api/patients/${v.patient}/shares/${S2.id}`, smile.manager);
        expect((await call('GET', `/api/patients/${v.patient}`, S2.manager)).status).toBeGreaterThanOrEqual(400);
    });

    it('a patient can never be shared to another clinic\'s branch', async () => {
        const r = await call('POST', `/api/patients/${v.patient}/shares`, smile.manager, { branch_id: C1.id });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(Number((await one(`SELECT count(*) AS n FROM patient_branch_access WHERE patient_id = $1 AND branch_id = $2`, [v.patient, C1.id])).n)).toBe(0);
    });
});

describe('notifications reach only the right people', () => {
    it('checking in a patient notifies only staff of that clinic', async () => {
        const appt = await newTestVisit(VISIT_MARK, S1, { patient_id: v.patient, doctor_id: v.doctor });
        await query(`UPDATE appointments SET status = 'scheduled', check_in_time = NULL, started_at = NULL WHERE id = $1`, [appt]);
        const r = await call('PATCH', `/api/appointments/${appt}/checked-in`, S1.reception);
        expect(r.status).toBe(200);
        const rows = await all(`SELECT n.user_id, n.tenant_id, n.branch_id, u.tenant_id AS user_tenant FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.appointment_id = $1`, [appt]);
        expect(rows.every((n) => Number(n.tenant_id) === smile.tenant_id && Number(n.user_tenant) === smile.tenant_id && Number(n.branch_id) === S1.id)).toBe(true);
    });

    it('a user cannot mark someone else\'s notification as read', async () => {
        const n = await one(`SELECT id, is_read FROM notifications WHERE tenant_id = $1 AND is_read = false ORDER BY id DESC LIMIT 1`, [smile.tenant_id]);
        if (!n) return;
        const r = await call('POST', `/api/notifications/${n.id}/read`, care.manager);
        expect((await one(`SELECT is_read FROM notifications WHERE id = $1`, [n.id])).is_read).toBe(false);
        expect(r.status === 404 || r.status === 403 || (r.status === 200 && r.body?.data == null)).toBe(true);
    });
});

describe('the same actions inside your OWN clinic still work (regression for the fixes)', () => {
    it('the manager edits his own receptionist: saved, and the answer has no password hash', async () => {
        const name = (await one(`SELECT full_name FROM profiles WHERE user_id = $1`, [S1.reception.id])).full_name;
        const r = await call('PUT', `/api/users/${S1.reception.id}`, smile.manager, { full_name: `${name} edited` });
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ id: S1.reception.id, email: S1.reception.email });
        expect(r.body.data).not.toHaveProperty('password');
        expect((await one(`SELECT full_name FROM profiles WHERE user_id = $1`, [S1.reception.id])).full_name).toBe(`${name} edited`);
        await query(`UPDATE profiles SET full_name = $1 WHERE user_id = $2`, [name, S1.reception.id]);
        expect((await call('GET', `/api/users/${S1.reception.id}`, smile.manager)).status).toBe(200);
    });

    it('a feedback invite for an own patient (with its visit) works; a visit of another patient is refused', async () => {
        const otherAppt = await one(`SELECT id FROM appointments WHERE branch_id = $1 AND patient_id <> $2 LIMIT 1`, [S1.id, v.patient]);
        const wrong = await call('POST', '/api/feedbacks/invite', S1.reception, { patient_id: v.patient, appointment_id: Number(otherAppt.id), language: 'en' });
        expect(wrong.status).toBe(404);
        const r = await call('POST', '/api/feedbacks/invite', S1.reception, { patient_id: v.patient, appointment_id: v.appointment, language: 'en' });
        expect(r.status).toBe(201);
        const form = await call('GET', `/api/public/feedback/${r.body.data.token}`);
        expect(form.status).toBe(200);
        await query(`DELETE FROM feedbacks WHERE token = $1`, [r.body.data.token]);
    });

    it('a reminder for an own appointment is saved with the appointment\'s patient and leaves the "to remind" list', async () => {
        const appt = await newTestVisit(VISIT_MARK, S1, { patient_id: v.patient, doctor_id: v.doctor });
        await query(`UPDATE appointments SET status = 'scheduled', check_in_time = NULL, started_at = NULL, scheduled_start = NOW() + INTERVAL '5 hours' WHERE id = $1`, [appt]);
        const hadTemplate = await one(`SELECT 1 AS x FROM reminder_templates WHERE tenant_id = $1 AND branch_id = $2`, [S1.tenant_id, S1.id]);
        expect((await call('PUT', '/api/reminders/template', S1.manager, { kur_msg: 'k {patient_name}', arb_msg: 'a {patient_name}', eng_msg: 'e {patient_name}' })).status).toBe(200);
        const listed = async () => (await call('GET', '/api/reminders/upcoming', S1.reception)).body.data.some((a) => Number(a.appointment_id) === appt);
        expect(await listed()).toBe(true);
        // a wrong patient_id in the request is ignored: the appointment's own patient is saved
        const r = await call('POST', `/api/reminders/${appt}/sent`, S1.reception, { patient_id: 1, language: 'en', message: 'See you soon' });
        expect(r.status).toBe(201);
        expect(Number((await one(`SELECT patient_id FROM reminders WHERE appointment_id = $1`, [appt])).patient_id)).toBe(v.patient);
        expect(await listed()).toBe(false);
        await query(`DELETE FROM reminders WHERE appointment_id = $1`, [appt]);
        if (!hadTemplate) await query(`DELETE FROM reminder_templates WHERE tenant_id = $1 AND branch_id = $2`, [S1.tenant_id, S1.id]);
    });
});

describe('nothing was changed by any attack', () => {
    it('every victim row is exactly as before', async () => {
        expect(await victimFingerprint()).toEqual(v.before);
    });
});
