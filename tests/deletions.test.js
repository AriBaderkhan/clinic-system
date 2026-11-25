// PART 8 — Deleting data (fixed 2026-11-24: a branch with data is refused, deletes keep a trace, no orphan feedback).
// Only throwaway rows are deleted: a made-up branch, patients, expenses and lab orders created here.
// The seeded branches are NEVER sent to the delete endpoint (one of them could be wiped).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { call, one, all, query, loadClinic, newTestVisit, removeTestVisits } from './helpers/testApp.js';

const MARK = 'test-deletions';
const N = Number;
let smile, care, S1, boss, careBoss;
const made = { branches: [], patients: [], labs: [] };

const newBranch = async (tenant_id) => {
    const b = await one(`INSERT INTO branches (tenant_id, name, location) VALUES ($1, $2, 'test') RETURNING id`, [tenant_id, `${MARK} ${Date.now()}`]);
    await query(`INSERT INTO branch_settings (branch_id, tenant_id, timezone, currency_code) VALUES ($1, $2, 'Asia/Baghdad', 'IQD')`, [b.id, tenant_id]);
    made.branches.push(N(b.id));
    return N(b.id);
};
const newPatient = async (branch_id, tenant_id = smile.tenant_id) => {
    const p = await one(`INSERT INTO patients (name, phone, age, tenant_id, branch_id) VALUES ($1, '0750' || lpad((random()*1e7)::int::text, 7, '0'), 30, $2, $3) RETURNING id`, [MARK, tenant_id, branch_id]);
    made.patients.push(N(p.id));
    return N(p.id);
};
const exists = async (table, id) => !!(await one(`SELECT 1 FROM ${table} WHERE id = $1`, [id]));
const lastAudit = (path) => one(`SELECT actor_id, method, path, details FROM audit_logs WHERE path = $1 ORDER BY id DESC LIMIT 1`, [path]);
const waitAudit = async (path) => { for (let i = 0; i < 20; i++) { const a = await lastAudit(path); if (a) return a; await new Promise((r) => setTimeout(r, 50)); } return null; };

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    care = await loadClinic('care.example.com');
    S1 = smile.branches[0];
    boss = smile.manager;
    careBoss = care.manager;
});

afterAll(async () => {
    await removeTestVisits(MARK);
    await query(`DELETE FROM feedbacks WHERE source = $1`, [MARK]);
    await query(`DELETE FROM lab_orders WHERE notes = $1`, [MARK]);
    if (made.labs.length) await query(`DELETE FROM labs WHERE id = ANY($1)`, [made.labs]);
    await query(`DELETE FROM monthly_expenses WHERE type = $1`, [MARK]);
    if (made.patients.length) await query(`DELETE FROM patients WHERE id = ANY($1) AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = patients.id)`, [made.patients]);
    for (const b of made.branches) {
        await query(`DELETE FROM patients WHERE branch_id = $1`, [b]);
        await query(`DELETE FROM monthly_expenses WHERE branch_id = $1`, [b]);
        await query(`DELETE FROM branch_settings WHERE branch_id = $1`, [b]);
        await query(`DELETE FROM branches WHERE id = $1`, [b]);
    }
});

describe('deleting a branch', () => {
    it('an EMPTY branch can be deleted, its settings go with it', async () => {
        const b = await newBranch(smile.tenant_id);
        const r = await call('DELETE', `/api/tenants/branches/${b}`, boss);
        expect(r.status).toBe(200);
        expect(await exists('branches', b)).toBe(false);
        expect(await one(`SELECT 1 FROM branch_settings WHERE branch_id = $1`, [b])).toBeFalsy();
    });

    it('a branch that HAS PATIENTS is refused with BRANCH_HAS_DATA (not wiped together with its patients)', async () => {
        const b = await newBranch(smile.tenant_id);
        const p = await newPatient(b);
        const r = await call('DELETE', `/api/tenants/branches/${b}`, boss);
        const branchLeft = await exists('branches', b);
        const patientLeft = await exists('patients', p);
        expect({ status: r.status, code: r.body.code, branchLeft, patientLeft }).toEqual({ status: 409, code: 'BRANCH_HAS_DATA', branchLeft: true, patientLeft: true });
    });

    it('a branch blocked by its data gives a clear answer (409 BRANCH_HAS_DATA), not "Invalid reference id."', async () => {
        const b = await newBranch(smile.tenant_id);
        await query(`INSERT INTO monthly_expenses (created_by, tenant_id, branch_id, type, amount) VALUES ($1, $2, $3, $4, 10)`, [boss.id, smile.tenant_id, b, MARK]);
        const r = await call('DELETE', `/api/tenants/branches/${b}`, boss);
        expect(await exists('branches', b)).toBe(true);
        expect({ status: r.status, code: r.body.code }).toEqual({ status: 409, code: 'BRANCH_HAS_DATA' });
    });

    it('a branch with only setup (a specialty) is refused cleanly, not with a database error', async () => {
        const b = await newBranch(smile.tenant_id);
        await query(`INSERT INTO specialties (tenant_id, branch_id, name) VALUES ($1, $2, $3)`, [smile.tenant_id, b, MARK]);
        const r = await call('DELETE', `/api/tenants/branches/${b}`, boss);
        await query(`DELETE FROM specialties WHERE branch_id = $1`, [b]);
        expect({ status: r.status, code: r.body.code }).toEqual({ status: 409, code: 'BRANCH_HAS_DATA' });
    });

    it('a manager of ANOTHER clinic cannot delete this branch', async () => {
        const b = await newBranch(smile.tenant_id);
        await call('DELETE', `/api/tenants/branches/${b}`, careBoss);
        expect(await exists('branches', b)).toBe(true);
    });

    it('deleting a branch of another clinic / a branch that does not exist answers 404, not 200 "ok"', async () => {
        const b = await newBranch(smile.tenant_id);
        const other = await call('DELETE', `/api/tenants/branches/${b}`, careBoss);
        const missing = await call('DELETE', `/api/tenants/branches/999999999`, boss);
        expect([other.status, missing.status]).toEqual([404, 404]);
        expect([other.body.code, missing.body.code]).toEqual(['BRANCH_NOT_FOUND', 'BRANCH_NOT_FOUND']);
    });

    it('a doctor / receptionist cannot delete a branch', async () => {
        const b = await newBranch(smile.tenant_id);
        expect((await call('DELETE', `/api/tenants/branches/${b}`, S1.doctors[0])).status).toBe(403);
        expect((await call('DELETE', `/api/tenants/branches/${b}`, S1.reception)).status).toBe(403);
        expect(await exists('branches', b)).toBe(true);
    });
});

describe('deleting a patient', () => {
    it('a patient with no records can be deleted; a second delete answers 404', async () => {
        const p = await newPatient(S1.id);
        expect((await call('DELETE', `/api/patients/${p}`, boss)).status).toBe(200);
        expect(await exists('patients', p)).toBe(false);
        expect((await call('DELETE', `/api/patients/${p}`, boss)).status).toBe(404);
    });

    it('a patient with a visit is refused with PATIENT_HAS_RECORDS and nothing is removed', async () => {
        const p = await newPatient(S1.id);
        const appt = await newTestVisit(MARK, S1, { patient_id: p });
        const r = await call('DELETE', `/api/patients/${p}`, boss);
        expect({ status: r.status, code: r.body.code }).toEqual({ status: 409, code: 'PATIENT_HAS_RECORDS' });
        expect(await exists('patients', p)).toBe(true);
        expect(await exists('appointments', appt)).toBe(true);
    });

    it('a patient of another branch / clinic cannot be deleted', async () => {
        const p = await newPatient(S1.id);
        expect((await call('DELETE', `/api/patients/${p}`, smile.managerIn(smile.branches[1].id))).status).toBeGreaterThanOrEqual(400);
        expect((await call('DELETE', `/api/patients/${p}`, careBoss)).status).toBeGreaterThanOrEqual(400);
        expect(await exists('patients', p)).toBe(true);
    });

    it('deleting a patient keeps their feedback (with no name) instead of leaving it pointing to nobody', async () => {
        const p = await newPatient(S1.id);
        const fb = await one(`INSERT INTO feedbacks (tenant_id, branch_id, patient_id, source, status) VALUES ($1, $2, $3, $4, 'new') RETURNING id`, [smile.tenant_id, S1.id, p, MARK]);
        expect((await call('DELETE', `/api/patients/${p}`, boss)).status).toBe(200);
        expect(await one(`SELECT patient_id FROM feedbacks WHERE id = $1`, [fb.id])).toEqual({ patient_id: null });
    });

    it('a patient delete that is refused leaves their feedback untouched', async () => {
        const p = await newPatient(S1.id);
        await newTestVisit(MARK, S1, { patient_id: p });
        const fb = await one(`INSERT INTO feedbacks (tenant_id, branch_id, patient_id, source, status) VALUES ($1, $2, $3, $4, 'new') RETURNING id`, [smile.tenant_id, S1.id, p, MARK]);
        expect((await call('DELETE', `/api/patients/${p}`, boss)).status).toBe(409);
        expect(N((await one(`SELECT patient_id FROM feedbacks WHERE id = $1`, [fb.id])).patient_id)).toBe(p);
    });
});

describe('deleting money records', () => {
    it('an expense can be deleted by the manager; a second delete answers 404', async () => {
        const c = await call('POST', '/api/monthly-expenses', boss, { type: MARK, amount: 125000, expense_date: '2026-11-20', note: MARK });
        expect(c.status).toBeLessThan(300);
        const id = N(c.body.data.id);
        expect((await call('DELETE', `/api/monthly-expenses/${id}`, boss)).status).toBe(200);
        expect((await call('DELETE', `/api/monthly-expenses/${id}`, boss)).status).toBe(404);
    });

    it('a doctor / receptionist cannot delete an expense', async () => {
        const c = await call('POST', '/api/monthly-expenses', boss, { type: MARK, amount: 5000, expense_date: '2026-11-20' });
        const id = N(c.body.data.id);
        expect((await call('DELETE', `/api/monthly-expenses/${id}`, S1.doctors[0])).status).toBe(403);
        expect((await call('DELETE', `/api/monthly-expenses/${id}`, S1.reception)).status).toBe(403);
        expect(await exists('monthly_expenses', id)).toBe(true);
    });

    it('after an expense is deleted, the activity log still says HOW MUCH it was (not only who + when)', async () => {
        const c = await call('POST', '/api/monthly-expenses', boss, { type: MARK, amount: 777000, expense_date: '2026-11-20' });
        const id = N(c.body.data.id);
        const path = `/api/monthly-expenses/${id}`;
        await call('DELETE', path, boss);
        const a = await waitAudit(path);
        expect(a?.actor_id && N(a.actor_id)).toBe(boss.id); // who + when: recorded
        expect(a.details).toMatchObject({ expense_id: id, type: MARK, amount: 777000, currency_code: 'IQD', expense_date: '2026-11-20' }); // what
    });

    it('a DELIVERED lab order (money already owed to the lab) cannot be hard-deleted without a trace', async () => {
        const lab = await one(`INSERT INTO labs (name, tenant_id, branch_id) VALUES ($1, $2, $3) RETURNING id`, [MARK, smile.tenant_id, S1.id]);
        made.labs.push(N(lab.id));
        const p = await newPatient(S1.id);
        const o = await one(`INSERT INTO lab_orders (lab_id, patient_id, doctor_id, total_cost, created_by, tenant_id, branch_id, status, notes, currency_code)
                             VALUES ($1, $2, $3, 90000, $4, $5, $6, 'delivered', $7, 'IQD') RETURNING id`, [lab.id, p, S1.doctors[0].id, boss.id, smile.tenant_id, S1.id, MARK]);
        const r = await call('DELETE', `/api/labs/orders/${o.id}`, boss);
        const gone = !(await exists('lab_orders', N(o.id)));
        const a = await waitAudit(`/api/labs/orders/${o.id}`);
        // decided: it may still be deleted, but the log keeps the order (cost, status, lab, patient)
        expect(r.status).toBe(200);
        expect(gone).toBe(true);
        expect(a.details).toMatchObject({ lab_order_id: N(o.id), total_cost: 90000, status: 'delivered', currency_code: 'IQD' });
    });
});

describe('soft deletes keep history', () => {
    it('a lab that is deleted is only switched off; its old orders stay', async () => {
        const lab = await one(`INSERT INTO labs (name, tenant_id, branch_id) VALUES ($1, $2, $3) RETURNING id`, [MARK, smile.tenant_id, S1.id]);
        made.labs.push(N(lab.id));
        expect((await call('DELETE', `/api/labs/${lab.id}`, boss)).status).toBe(200);
        expect((await one(`SELECT is_active FROM labs WHERE id = $1`, [lab.id])).is_active).toBe(false);
    });

    it('the seeded data has no orphans (every visit, payment and plan still points to a real parent)', async () => {
        // only the made-up clinics: branch 1 (old real-data copy) has 27 old orphan visits + 19 orphan reminders, reported separately
        const T = [smile.tenant_id, care.tenant_id];
        const rows = await all(`
            SELECT 'appointments->patients' AS link, count(*) AS n FROM appointments a WHERE a.tenant_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM patients p WHERE p.id = a.patient_id)
            UNION ALL SELECT 'sessions->appointments', count(*) FROM sessions s WHERE s.tenant_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = s.appointment_id)
            UNION ALL SELECT 'payments->sessions', count(*) FROM session_payments sp WHERE sp.tenant_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = sp.session_id)
            UNION ALL SELECT 'feedbacks->patients', count(*) FROM feedbacks f WHERE f.tenant_id = ANY($1) AND f.source <> '${MARK}' AND f.patient_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM patients p WHERE p.id = f.patient_id)
            UNION ALL SELECT 'reminders->appointments', count(*) FROM reminders r WHERE r.tenant_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = r.appointment_id)
            UNION ALL SELECT 'labs->branches', count(*) FROM labs l WHERE l.tenant_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = l.branch_id)`, [T]);
        expect(rows.filter((r) => N(r.n) > 0)).toEqual([]);
    });
});
