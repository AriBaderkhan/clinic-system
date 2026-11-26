// Reminders list: tomorrow + the 3 days after it (clinic time), nearest first.
// Made-up data only; everything made is removed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { call, one, query, loadClinic, newTestVisit, removeTestVisits } from './helpers/testApp.js';

const MARK = 'test-reminders';
let S1, hadTemplate;

// an appointment at "clinic day + days, at hh:mm" (Iraq time), status scheduled
const apptAt = async (days, time) => {
    const id = await newTestVisit(MARK, S1);
    await query(`UPDATE appointments SET status = 'scheduled', check_in_time = NULL, started_at = NULL,
                   scheduled_start = (date_trunc('day', NOW() AT TIME ZONE 'Asia/Baghdad') + make_interval(days => $2) + $3::time) AT TIME ZONE 'Asia/Baghdad'
                 WHERE id = $1`, [id, days, time]);
    return id;
};
const listedIds = async () => (await call('GET', '/api/reminders/upcoming', S1.reception)).body.data.map((a) => Number(a.appointment_id));

beforeAll(async () => {
    S1 = (await loadClinic('smile.example.com')).branches[0];
    // the list needs the branch's message template
    hadTemplate = await one(`SELECT 1 AS x FROM reminder_templates WHERE tenant_id = $1 AND branch_id = $2`, [S1.tenant_id, S1.id]);
    if (!hadTemplate) await call('PUT', '/api/reminders/template', S1.manager, { kur_msg: 'k {patient_name}', arb_msg: 'a {patient_name}', eng_msg: 'e {patient_name}' });
});
afterAll(async () => {
    await query(`DELETE FROM reminders WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint = $1)`, [MARK]);
    await removeTestVisits(MARK);
    if (!hadTemplate) await query(`DELETE FROM reminder_templates WHERE tenant_id = $1 AND branch_id = $2`, [S1.tenant_id, S1.id]);
});

describe('which days are in the reminders list', () => {
    it('starts tomorrow 00:00 and ends at the end of the 4th day (clinic time)', async () => {
        const todayLate = await apptAt(0, '23:59');
        const tomorrowFirst = await apptAt(1, '00:00');
        const day2 = await apptAt(2, '12:00');
        const day3 = await apptAt(3, '09:30');
        const day4Last = await apptAt(4, '23:59');
        const day5First = await apptAt(5, '00:00');

        const ids = await listedIds();
        expect(ids).not.toContain(todayLate);
        expect(ids).not.toContain(day5First);
        for (const id of [tomorrowFirst, day2, day3, day4Last]) expect(ids).toContain(id);

        // nearest first: tomorrow, then day 2, day 3, day 4
        const mine = ids.filter((id) => [tomorrowFirst, day2, day3, day4Last].includes(id));
        expect(mine).toEqual([tomorrowFirst, day2, day3, day4Last]);
    });

    it('a sent reminder and a non-scheduled appointment are not listed', async () => {
        const sent = await apptAt(2, '10:00');
        const checkedIn = await apptAt(2, '11:00');
        await query(`UPDATE appointments SET status = 'checked_in' WHERE id = $1`, [checkedIn]);
        const patient = (await one(`SELECT patient_id FROM appointments WHERE id = $1`, [sent])).patient_id;
        const r = await call('POST', `/api/reminders/${sent}/sent`, S1.reception, { patient_id: Number(patient), language: 'en', message: 'See you' });
        expect(r.status).toBe(201);
        const ids = await listedIds();
        expect(ids).not.toContain(sent);
        expect(ids).not.toContain(checkedIn);
    });
});
