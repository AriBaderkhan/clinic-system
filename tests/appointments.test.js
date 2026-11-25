// PART 7 — Appointments: status changes and double booking (reported, decided and fixed 2026-11-24).
// Fresh appointments on "Test Smile" branch 1, all marked and removed at the end; rule switches put back.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { call, one, all, query, loadClinic, removeTestVisits, keepWorkflow } from './helpers/testApp.js';

const MARK = 'test-appointments';
const startedAt = new Date();
let smile, S1, boss, rec, docA, docB, restore, patients = [], fillingId;
const N = Number;
let minuteOffset = 0;

// a unique future time for each booking, so tests never collide with each other or with the seed
const slot = (daysAhead = 30) => { minuteOffset += 7; const d = new Date(Date.now() + daysAhead * 86400000); d.setUTCHours(5, 0, 0, 0); return new Date(d.getTime() + minuteOffset * 60000).toISOString(); };
const book = (body, user = rec) => call('POST', '/api/appointments', user, { appointment_type: 'normal', complaint: MARK, ...body });
const status = async (id) => (await one(`SELECT status FROM appointments WHERE id = $1`, [id])).status;
const step = (id, what, user = boss, body) => call('PATCH', `/api/appointments/${id}/${what}`, user, body);
const newAppt = async (extra = {}) => {
    const r = await book({ patient_id: patients[0], doctor_id: docA.id, scheduled_start: slot(), ...extra });
    if (r.status !== 201 && r.status !== 200) throw new Error('book: ' + JSON.stringify(r.body));
    return N(r.body.data.id);
};
// walk an appointment to a status through the real steps
const walk = async (id, to) => {
    const path = { checked_in: ['checked-in'], in_progress: ['checked-in', 'in_progress'], completed: ['checked-in', 'in_progress', 'completed'], cancelled: ['cancelled'], no_show: ['no_show'] }[to];
    for (const p of path) {
        const r = p === 'completed'
            ? await call('POST', `/api/appointments/${id}/completed`, docA, { works: [{ work_id: fillingId, quantity: 1, tooth_number: 11 }] })
            : await step(id, p, boss, ['cancelled', 'no_show'].includes(p) ? { cancel_reason: 'test reason' } : undefined);
        if (r.status !== 200) throw new Error(`walk ${p}: ${JSON.stringify(r.body)}`);
    }
};

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    S1 = smile.branches[0];
    boss = smile.manager;
    rec = S1.reception;
    [docA, docB] = S1.doctors;
    restore = await keepWorkflow(S1);
    await call('PUT', '/api/settings/workflow', S1.manager, { allow_settle_unpaid: true, allow_discounts: true, max_discount_percent: 100, block_booking_if_owes: false, allow_overpay: true, allow_one_visit_plans: true });
    patients = (await all(`SELECT id FROM patients WHERE branch_id = $1 ORDER BY id LIMIT 3`, [S1.id])).map((p) => N(p.id));
    fillingId = N((await one(`SELECT id FROM work_catalog WHERE branch_id = $1 AND code = 'FILLING'`, [S1.id])).id);
}, 60000);

afterAll(async () => {
    await restore();
    await query(`UPDATE users SET is_active = true WHERE id = $1`, [docB.id]);
    await query(`DELETE FROM notifications WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint = $1)`, [MARK]);
    await removeTestVisits(MARK);
    await query(`DELETE FROM audit_logs WHERE tenant_id = $1 AND created_at >= $2`, [smile.tenant_id, startedAt]);
});

describe('the allowed path of a visit', () => {
    it('booked -> checked in -> in progress -> finished, with each time stamp set', async () => {
        const id = await newAppt();
        expect(await status(id)).toBe('scheduled');
        await walk(id, 'completed');
        const a = await one(`SELECT status, check_in_time, started_at, finished_at FROM appointments WHERE id = $1`, [id]);
        expect(a.status).toBe('completed');
        expect(a.check_in_time && a.started_at && a.finished_at).toBeTruthy();
    });

    it('booked -> cancelled, checked in -> cancelled, booked -> no show; who did it and the reason are kept', async () => {
        const a = await newAppt(); await walk(a, 'cancelled');
        const b = await newAppt(); await walk(b, 'checked_in'); expect((await step(b, 'cancelled', boss, { cancel_reason: 'changed mind' })).status).toBe(200);
        const c = await newAppt(); await walk(c, 'no_show');
        const row = await one(`SELECT status, cancel_reason, updated_by FROM appointments WHERE id = $1`, [b]);
        expect(row).toMatchObject({ status: 'cancelled', cancel_reason: 'changed mind' });
        expect(N(row.updated_by)).toBe(boss.id);
        expect(await status(c)).toBe('no_show');
    });
});

describe('forbidden status changes are refused with INVALID_APPOINTMENT_STATUS and change nothing', () => {
    const tries = [
        ['scheduled', 'in_progress'], ['scheduled', 'completed'],
        ['checked_in', 'no_show'], ['checked_in', 'checked-in'],
        ['in_progress', 'checked-in'], ['in_progress', 'no_show'],
        ['completed', 'checked-in'], ['completed', 'in_progress'], ['completed', 'cancelled'], ['completed', 'no_show'], ['completed', 'completed'],
        ['cancelled', 'checked-in'], ['cancelled', 'in_progress'], ['cancelled', 'no_show'],
        ['no_show', 'checked-in'], ['no_show', 'cancelled'],
    ];
    for (const [from, to] of tries) {
        it(`${from} -> ${to}`, async () => {
            const id = await newAppt();
            if (from !== 'scheduled') await walk(id, from);
            const r = to === 'completed'
                ? await call('POST', `/api/appointments/${id}/completed`, docA, { works: [{ work_id: fillingId, quantity: 1, tooth_number: 11 }] })
                : await step(id, to, boss, ['cancelled', 'no_show'].includes(to) ? { cancel_reason: 'test reason' } : undefined);
            expect(r.status, JSON.stringify(r.body)).toBe(400);
            expect(r.body.code).toBe('INVALID_APPOINTMENT_STATUS');
            expect(await status(id)).toBe(from);
        });
    }

    // decided by the owner (2026-11-24): a visit in progress may be cancelled (the patient has to leave)
    it('a visit that is IN PROGRESS can be cancelled, with its reason', async () => {
        const id = await newAppt();
        await walk(id, 'in_progress');
        const r = await step(id, 'cancelled', boss, { cancel_reason: 'patient left' });
        expect(r.status).toBe(200);
        expect(await one(`SELECT status, cancel_reason FROM appointments WHERE id = $1`, [id])).toMatchObject({ status: 'cancelled', cancel_reason: 'patient left' });
    });
});

describe('two clicks at the same moment', () => {
    it('two check-ins at once: one works, the other gets "already checked in" (no server error)', async () => {
        const id = await newAppt();
        const rs = await Promise.all([step(id, 'checked-in'), step(id, 'checked-in', rec)]);
        expect(rs.map((r) => r.status).sort()).toEqual([200, 400]);
        expect(rs.find((r) => r.status === 400).body.code).toBe('INVALID_APPOINTMENT_STATUS');
    });

    it('two "start" at once: one works, the other gets a clear refusal', async () => {
        const id = await newAppt();
        await walk(id, 'checked_in');
        const rs = await Promise.all([step(id, 'in_progress'), step(id, 'in_progress')]);
        expect(rs.map((r) => r.status).sort()).toEqual([200, 400]);
    });

    it('two "finish visit" at once: only ONE visit record is made, the other gets a clear refusal', async () => {
        const id = await newAppt();
        await walk(id, 'in_progress');
        const works = { works: [{ work_id: fillingId, quantity: 1, tooth_number: 11 }] };
        const rs = await Promise.all([call('POST', `/api/appointments/${id}/completed`, docA, works), call('POST', `/api/appointments/${id}/completed`, docA, works)]);
        expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
        expect(rs.every((r) => r.status < 500), rs.map((r) => r.status).join(',')).toBe(true);
        expect(N((await one(`SELECT count(*) AS n FROM sessions WHERE appointment_id = $1`, [id])).n)).toBe(1);
    });
});

describe('double booking', () => {
    it('the same doctor at the exact same time is refused (APPOINTMENT_OVERLAP)', async () => {
        const t = slot();
        expect((await book({ patient_id: patients[0], doctor_id: docA.id, scheduled_start: t })).status).toBe(201);
        const r = await book({ patient_id: patients[1], doctor_id: docA.id, scheduled_start: t });
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('APPOINTMENT_OVERLAP');
    });

    it('a cancelled appointment frees its time again', async () => {
        const t = slot();
        const first = await book({ patient_id: patients[0], doctor_id: docA.id, scheduled_start: t });
        await walk(N(first.body.data.id), 'cancelled');
        expect((await book({ patient_id: patients[1], doctor_id: docA.id, scheduled_start: t })).status).toBe(201);
    });

    it('another doctor at the same time is fine', async () => {
        const t = slot();
        expect((await book({ patient_id: patients[0], doctor_id: docA.id, scheduled_start: t })).status).toBe(201);
        expect((await book({ patient_id: patients[1], doctor_id: docB.id, scheduled_start: t })).status).toBe(201);
    });

    it('two receptionists booking the SAME doctor + time at the same moment: only one is saved, the other gets APPOINTMENT_OVERLAP', async () => {
        const t = slot();
        const rs = await Promise.all([
            book({ patient_id: patients[0], doctor_id: docA.id, scheduled_start: t }),
            book({ patient_id: patients[1], doctor_id: docA.id, scheduled_start: t }, S1.manager),
        ]);
        const n = N((await one(`SELECT count(*) AS n FROM appointments WHERE doctor_id = $1 AND scheduled_start = $2 AND is_deleted = false AND status NOT IN ('cancelled','no_show')`, [docA.id, t])).n);
        expect(n, rs.map((r) => r.status).join(',')).toBe(1);
        expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('the same doctor 15 minutes later is allowed (only the EXACT same minute is blocked; the 1-hour rule is switched off)', async () => {
        const t = slot();
        expect((await book({ patient_id: patients[0], doctor_id: docA.id, scheduled_start: t })).status).toBe(201);
        const later = new Date(new Date(t).getTime() + 15 * 60000).toISOString();
        expect((await book({ patient_id: patients[1], doctor_id: docA.id, scheduled_start: later })).status).toBe(201);
    });

    it('the same PATIENT with two doctors at the same time is allowed', async () => {
        const t = slot();
        expect((await book({ patient_id: patients[2], doctor_id: docA.id, scheduled_start: t })).status).toBe(201);
        expect((await book({ patient_id: patients[2], doctor_id: docB.id, scheduled_start: t })).status).toBe(201);
    });

    it('rescheduling onto a taken time is refused too', async () => {
        const t = slot();
        await book({ patient_id: patients[0], doctor_id: docA.id, scheduled_start: t });
        const id = await newAppt();
        const r = await call('PUT', `/api/appointments/${id}`, rec, { scheduled_start: t });
        expect(r.body.code).toBe('APPOINTMENT_OVERLAP');
    });
});

describe('booking rules', () => {
    it('"no new booking while the patient owes": on -> PATIENT_HAS_UNPAID; off -> allowed', async () => {
        const owes = N((await one(`SELECT a.patient_id FROM sessions s JOIN appointments a ON a.id = s.appointment_id
                                   WHERE s.branch_id = $1 AND s.is_paid = false AND s.total > 0 AND a.status = 'completed' LIMIT 1`, [S1.id])).patient_id);
        await call('PUT', '/api/settings/workflow', S1.manager, { allow_settle_unpaid: true, allow_discounts: true, max_discount_percent: 100, block_booking_if_owes: true, allow_overpay: true, allow_one_visit_plans: true });
        const r = await book({ patient_id: owes, doctor_id: docA.id, scheduled_start: slot() });
        await call('PUT', '/api/settings/workflow', S1.manager, { allow_settle_unpaid: true, allow_discounts: true, max_discount_percent: 100, block_booking_if_owes: false, allow_overpay: true, allow_one_visit_plans: true });
        expect(r.body.code).toBe('PATIENT_HAS_UNPAID');
        expect((await book({ patient_id: owes, doctor_id: docA.id, scheduled_start: slot() })).status).toBe(201);
    });

    it('a doctor who was switched off (left the clinic) cannot be booked or moved to; his old appointments can still be edited', async () => {
        const old = await book({ patient_id: patients[0], doctor_id: docB.id, scheduled_start: slot() });
        const other = await newAppt();
        await query(`UPDATE users SET is_active = false WHERE id = $1`, [docB.id]);
        try {
            const r = await book({ patient_id: patients[0], doctor_id: docB.id, scheduled_start: slot() });
            expect(r.body.code).toBe('DOCTOR_NOT_ACTIVE');
            expect((await call('PUT', `/api/appointments/${other}`, rec, { doctor_id: docB.id })).body.code).toBe('DOCTOR_NOT_ACTIVE');
            // the screen sends the same doctor back when only the time changes: that must still work
            expect((await call('PUT', `/api/appointments/${N(old.body.data.id)}`, rec, { doctor_id: docB.id, scheduled_start: slot() })).status).toBe(200);
        } finally {
            await query(`UPDATE users SET is_active = true WHERE id = $1`, [docB.id]);
        }
    });

    it('bad input: missing doctor / patient / time, or a non-date, is refused', async () => {
        for (const body of [{ doctor_id: docA.id, scheduled_start: slot() }, { patient_id: patients[0], scheduled_start: slot() }, { patient_id: patients[0], doctor_id: docA.id }, { patient_id: patients[0], doctor_id: docA.id, scheduled_start: 'tomorrow' }]) {
            expect((await call('POST', '/api/appointments', rec, body)).status, JSON.stringify(body)).toBe(400);
        }
    });
});

describe('changing an appointment', () => {
    it('a booked appointment can be moved to another free time or doctor', async () => {
        const id = await newAppt();
        expect((await call('PUT', `/api/appointments/${id}`, rec, { scheduled_start: slot(), doctor_id: docB.id })).status).toBe(200);
    });

    // decided by the owner (2026-11-24): allowed, so reception can correct a wrongly chosen doctor
    it('a FINISHED visit can still be corrected to another doctor / day (by design)', async () => {
        const id = await newAppt();
        await walk(id, 'completed');
        const r = await call('PUT', `/api/appointments/${id}`, boss, { doctor_id: docB.id, scheduled_start: slot(60) });
        expect(r.status).toBe(200);
        expect(N((await one(`SELECT doctor_id FROM appointments WHERE id = $1`, [id])).doctor_id)).toBe(docB.id);
    });

    it('the patient of a visit that already has treatments cannot be changed', async () => {
        const id = await newAppt();
        await walk(id, 'completed');
        expect((await call('PUT', `/api/appointments/${id}`, boss, { patient_id: patients[1] })).body.code).toBe('PATIENT_CHANGE_HAS_RECORDS');
    });
});

describe('deleting an appointment', () => {
    it('one with treatments/payments is refused; an empty one is removed (kept, marked deleted) and frees its time', async () => {
        const full = await newAppt();
        await walk(full, 'completed');
        expect((await call('DELETE', `/api/appointments/${full}`, boss)).body.code).toBe('APPOINTMENT_HAS_RECORDS');
        const t = slot();
        const empty = await book({ patient_id: patients[0], doctor_id: docA.id, scheduled_start: t });
        const id = N(empty.body.data.id);
        expect((await call('DELETE', `/api/appointments/${id}`, boss)).status).toBe(200);
        expect((await one(`SELECT is_deleted FROM appointments WHERE id = $1`, [id])).is_deleted).toBe(true);
        expect((await book({ patient_id: patients[1], doctor_id: docA.id, scheduled_start: t })).status).toBe(201);
    });
});

describe('"today" in the clinic\'s own time zone (Baghdad, UTC+3)', () => {
    it('an appointment at 01:00 Baghdad time today shows in today\'s list (it is still "yesterday" in UTC)', async () => {
        const nowBaghdad = new Date(Date.now() + 3 * 3600000);
        const t = new Date(Date.UTC(nowBaghdad.getUTCFullYear(), nowBaghdad.getUTCMonth(), nowBaghdad.getUTCDate(), 1 - 3, 0, 0)).toISOString();
        const r = await book({ patient_id: patients[0], doctor_id: docA.id, scheduled_start: t });
        const id = N(r.body.data.id);
        const today = await call('GET', '/api/appointments?day=today&limit=100&q=' + encodeURIComponent((await one(`SELECT name FROM patients WHERE id = $1`, [patients[0]])).name), boss);
        expect(today.body.data.some((a) => N(a.id ?? a.appointment_id) === id)).toBe(true);
    });
});

describe('the calendar', () => {
    it('a huge date range (100 years) is refused with INVALID_CALENDAR_RANGE', async () => {
        const r = await call('GET', '/api/appointments/calendar?from=2000-01-01T00:00:00Z&to=2100-01-01T00:00:00Z', boss);
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('INVALID_CALENDAR_RANGE');
    });

    it('what the calendar screen really asks for (6-week month grid, 1 week) still works', async () => {
        const from = new Date(Date.UTC(2026, 10, 1)).toISOString();
        expect((await call('GET', `/api/appointments/calendar?from=${from}&to=${new Date(Date.UTC(2026, 11, 13)).toISOString()}`, boss)).status).toBe(200);
        expect((await call('GET', `/api/appointments/calendar?from=${from}&to=${new Date(Date.UTC(2026, 10, 8)).toISOString()}`, boss)).status).toBe(200);
    });
});
