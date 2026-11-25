// The same patient saved twice (fast double click, retry, two tabs) must create ONE patient.
// Rule: same name + same phone in the same branch -> refused. Different name OR phone OR branch -> allowed.
// Runs on the made-up clinic "Test Smile"; every patient it makes is removed at the end.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { call, one, query, loadClinic } from './helpers/testApp.js';

const TAG = `Test Dup ${Date.now()}`;
const PHONE = `0750${String(Date.now()).slice(-7)}`;
const body = (extra = {}) => ({ name: TAG, phone: PHONE, age: 30, gender: 'male', ...extra });
const count = async (name, phone, branchId) => Number((await one(
    `SELECT count(*) AS n FROM patients WHERE name = $1 AND phone = $2 AND branch_id = $3`, [name, phone, branchId])).n);
let clinic, branch, otherBranch;

beforeAll(async () => {
    clinic = await loadClinic('smile.example.com');
    [branch, otherBranch] = clinic.branches;
});

afterAll(async () => {
    await query(`DELETE FROM patients WHERE name ILIKE $1`, [`${TAG}%`]);
});

describe('the same patient saved many times at once', () => {
    it('5 saves at the same moment -> 1 created, 4 refused with PATIENT_ALREADY_EXISTS', async () => {
        const results = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/api/patients', branch.reception, body())));
        expect(results.filter((r) => r.status === 201)).toHaveLength(1);
        expect(results.filter((r) => r.status === 409 && r.body.code === 'PATIENT_ALREADY_EXISTS')).toHaveLength(4);
        expect(await count(TAG, PHONE, branch.id)).toBe(1);
    });

    it('saving it again later is refused with the standard error shape', async () => {
        const r = await call('POST', '/api/patients', branch.reception, body());
        expect(r.status).toBe(409);
        expect(r.body).toMatchObject({ code: 'PATIENT_ALREADY_EXISTS', message: expect.any(String) });
    });

    it('other capitals / extra spaces count as the same name', async () => {
        const r = await call('POST', '/api/patients', branch.reception, body({ name: `  ${TAG.toUpperCase()}  ` }));
        expect(r.status).toBe(409);
    });
});

describe('what must still be allowed', () => {
    it('same phone, different name (family sharing a phone)', async () => {
        expect((await call('POST', '/api/patients', branch.reception, body({ name: `${TAG} Son` }))).status).toBe(201);
    });
    it('same name, different phone', async () => {
        expect((await call('POST', '/api/patients', branch.reception, body({ phone: `0751${PHONE.slice(4)}` }))).status).toBe(201);
    });
    it('same name + phone in ANOTHER branch (the rule is per branch)', async () => {
        const r = await call('POST', '/api/patients', clinic.managerIn(otherBranch.id), body());
        expect(r.status).toBe(201);
        expect(await count(TAG, PHONE, otherBranch.id)).toBe(1);
    });
    it('the clinic manager can add a patient; response shape unchanged', async () => {
        const r = await call('POST', '/api/patients', clinic.manager, body({ name: `${TAG} Manager`, phone: `0752${PHONE.slice(4)}` }));
        expect(r.status).toBe(201);
        expect(r.body).toMatchObject({ ok: true, data: { id: expect.anything(), name: `${TAG} Manager` } });
    });
});

describe('nothing else changed', () => {
    it('missing phone -> 400', async () => {
        expect((await call('POST', '/api/patients', branch.reception, { name: TAG, age: 30 })).status).toBe(400);
    });
    it('editing the patient still works and the list shows it once', async () => {
        const p = await one(`SELECT id FROM patients WHERE name = $1 AND phone = $2 AND branch_id = $3`, [TAG, PHONE, branch.id]);
        expect((await call('PUT', `/api/patients/${p.id}`, branch.reception, { address: 'Test street' })).status).toBe(200);
        const r = await call('GET', `/api/patients?q=${encodeURIComponent(TAG)}`, branch.reception);
        expect(r.status).toBe(200);
        expect(r.body.data.filter((x) => x.name === TAG && x.phone === PHONE)).toHaveLength(1);
    });
});
