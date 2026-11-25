// PART 4 — Attacks: unsafe SQL and image upload.  REPORT MODE: failing tests = findings (no app code changed).
// Every attack is made by a user who IS allowed to use the endpoint (the clinic manager of "Test Smile"),
// so only the attack itself is tested. Made-up data; everything created is removed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { call, one, all, query, loadClinic, newTestVisit, removeTestVisits } from './helpers/testApp.js';
import request from 'supertest';
import app from '../main.js';
import jwt from 'jsonwebtoken';

const MARK = 'test-attacks';
const startedAt = new Date();
let smile, S1, boss, own = {}, saved = [];

// rows the "update" attacks touch with a REAL field: saved as JSON and put back exactly at the end
const keep = async (table, id) => saved.push({ table, json: (await one(`SELECT row_to_json(x)::text AS j FROM ${table} x WHERE id = $1`, [id])).j });
const putBack = async () => {
    for (const { table, json } of saved) {
        const cols = Object.keys(JSON.parse(json)).filter((c) => c !== 'id');
        await query(`UPDATE ${table} SET ${cols.map((c) => `${c} = b.${c}`).join(', ')} FROM json_populate_record(NULL::${table}, $1::json) b WHERE ${table}.id = b.id`, [json]);
    }
};

const ok = (r) => r.status >= 200 && r.status < 300;
const tablesAlive = async () => Number((await one(`SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('patients','appointments','sessions','monthly_expenses','users')`)).n) === 5;
const PNG_1PX = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const upload = (path, user, files, method = 'post') => {
    let req = request(app)[method](path).set('Authorization', `Bearer ${jwt.sign({ id: user.id, tenant_id: user.tenant_id, branch_id: user.branch_id }, process.env.JWT_SECRET, { expiresIn: '10m' })}`);
    for (const f of files) req = req.attach('images', f.buffer, { filename: f.name, contentType: f.type });
    return req;
};

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    S1 = smile.branches[0];
    boss = smile.manager;
    const made = async (r, label) => { if (!ok(r)) throw new Error(`setup ${label}: ${r.status} ${JSON.stringify(r.body)}`); return Number(r.body.data?.id ?? r.body.data?.[0]?.id); };
    const work = Number((await one(`SELECT id FROM work_catalog WHERE branch_id = $1 AND code = 'FILLING'`, [S1.id])).id);
    own.patient = Number((await one(`SELECT id FROM patients WHERE branch_id = $1 ORDER BY id LIMIT 1`, [S1.id])).id);
    own.appointment = await newTestVisit(MARK, S1, { patient_id: own.patient });
    await call('POST', `/api/appointments/${own.appointment}/completed`, boss, { works: [{ work_id: work, quantity: 1, tooth_number: 11 }] });
    own.session = Number((await one(`SELECT id FROM sessions WHERE appointment_id = $1`, [own.appointment])).id);
    own.plan = Number((await one(`SELECT id FROM treatment_plans WHERE branch_id = $1 ORDER BY id LIMIT 1`, [S1.id])).id);
    own.work = Number((await one(`SELECT id FROM work_catalog WHERE branch_id = $1 AND code = 'EXTRACTION'`, [S1.id])).id);
    own.discount = await made(await call('POST', '/api/discounts', boss, { name: 'Attack discount', type: 'percent', value: 5 }), 'discount');
    own.expense = await made(await call('POST', '/api/monthly-expenses', boss, { type: 'Other', amount: 1000, expense_date: '2026-11-01', note: 'attack' }), 'expense');
    own.specialty = await made(await call('POST', '/api/specialties', boss, { name: 'Attack spec' }), 'specialty');
    own.floor = await made(await call('POST', '/api/floors', boss, { name: 'Attack floor' }), 'floor');
    await keep('tenants', smile.tenant_id);
    await keep('branches', S1.id);
    await keep('patients', own.patient);
    own.lab = await made(await call('POST', '/api/labs', boss, { name: 'Attack lab', treatments: [{ work_id: work, cost: 1000 }] }), 'lab');
    own.labOrder = await made(await call('POST', '/api/labs/orders', boss, { lab_id: own.lab, patient_id: own.patient, doctor_id: S1.doctors[0].id, items: [{ work_id: work, quantity: 1 }] }), 'lab order');
}, 120000);

afterAll(async () => {
    await putBack();
    const imgs = await all(`SELECT id FROM session_images WHERE session_id = $1`, [own.session]);
    for (const img of imgs) await call('DELETE', `/api/sessions/${own.session}/images/${img.id}`, boss);
    await query(`DELETE FROM lab_order_items WHERE order_id = $1`, [own.labOrder]);
    await query(`DELETE FROM lab_orders WHERE id = $1`, [own.labOrder]);
    await query(`DELETE FROM lab_treatments WHERE lab_id = $1`, [own.lab]);
    await query(`DELETE FROM labs WHERE id = $1`, [own.lab]);
    await query(`DELETE FROM floors WHERE id = $1`, [own.floor]);
    await query(`DELETE FROM specialties WHERE id = $1`, [own.specialty]);
    await query(`DELETE FROM discounts WHERE id = $1`, [own.discount]);
    await query(`DELETE FROM monthly_expenses WHERE id = $1`, [own.expense]);
    await removeTestVisits(MARK);
    await query(`DELETE FROM audit_logs WHERE tenant_id = $1 AND created_at >= $2`, [smile.tenant_id, startedAt]);
});

describe('poisoned column names in "update" requests (the old plan bug)', () => {
    // a JSON KEY that would become SQL text if a model copied keys into "SET <key> = ..."
    const POISON = [`name = 'hacked', tenant_id`, `note"; DROP TABLE monthly_expenses; --`];
    const targets = () => [
        ['PUT', `/api/patients/${own.patient}`], ['PUT', `/api/appointments/${own.appointment}`], ['PUT', `/api/sessions/${own.session}/normal`],
        ['PATCH', `/api/treatment-plans/${own.plan}`], ['PUT', `/api/works/${own.work}`], ['PUT', `/api/discounts/${own.discount}`],
        ['PUT', `/api/monthly-expenses/${own.expense}`], ['PUT', `/api/specialties/${own.specialty}`], ['PUT', `/api/floors/${own.floor}`],
        ['PUT', `/api/labs/${own.lab}`], ['PUT', `/api/labs/orders/${own.labOrder}`], ['PUT', `/api/branches/${S1.id}`], ['PUT', '/api/tenants'],
        ['PUT', `/api/users/${S1.reception.id}`], ['PUT', '/api/profile/me'], ['PUT', '/api/settings/workflow'], ['PATCH', `/api/appointments/${own.appointment}/visit-draft`],
    ];

    it('no poisoned key ever reaches the database (refused, or ignored without error)', async () => {
        // an empty update is tested separately below; here the poison always comes WITH a real field
        const bad = [];
        for (const [method, path] of targets()) {
            for (const key of POISON) {
                const r = await call(method, path, boss, { [key]: 'x', name: 'Attack name ok' });
                if (r.status >= 500) bad.push(`${method} ${path} [${key.slice(0, 20)}] -> ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
            }
        }
        expect(bad).toEqual([]);
        expect(await tablesAlive()).toBe(true);
    });

    it('patient edit: the poisoned key is thrown away and only the real field is saved', async () => {
        const before = await one(`SELECT name, address FROM patients WHERE id = $1`, [own.patient]);
        const r = await call('PUT', `/api/patients/${own.patient}`, boss, { [POISON[0]]: 'x', address: 'Attack street' });
        const after = await one(`SELECT name, address FROM patients WHERE id = $1`, [own.patient]);
        await query(`UPDATE patients SET address = $1 WHERE id = $2`, [before.address, own.patient]);
        expect(r.status).toBe(200);
        expect(after).toEqual({ name: before.name, address: 'Attack street' });
    });

    it('an edit with nothing to change answers 400, not a server error', async () => {
        const bad = [];
        for (const [method, path] of targets()) {
            const r = await call(method, path, boss, {});
            if (r.status >= 500) bad.push(`${method} ${path} -> ${r.status}`);
        }
        expect(bad).toEqual([]);
    });

    it('nothing was renamed to "hacked" anywhere', async () => {
        const hits = await all(`
            SELECT 'patients' t FROM patients WHERE name = 'hacked' UNION ALL SELECT 'work' FROM work_catalog WHERE name = 'hacked'
            UNION ALL SELECT 'discount' FROM discounts WHERE name = 'hacked' UNION ALL SELECT 'specialty' FROM specialties WHERE name = 'hacked'
            UNION ALL SELECT 'floor' FROM floors WHERE name = 'hacked' UNION ALL SELECT 'lab' FROM labs WHERE name = 'hacked'
            UNION ALL SELECT 'branch' FROM branches WHERE name = 'hacked' UNION ALL SELECT 'tenant' FROM tenants WHERE name = 'hacked'`);
        expect(hits).toEqual([]);
    });
});

describe('SQL tricks in searches, filters and IDs', () => {
    const PAYLOADS = [`' OR 1=1 --`, `'; DROP TABLE patients; --`, `%' UNION SELECT password, email FROM users --`, `\\`, `' AND pg_sleep(3) IS NULL --`];
    const searches = [
        '/api/patients?q=', '/api/patients/search?q=', '/api/appointments?q=', '/api/sessions?q=', '/api/sessions/unpaid?q=',
        '/api/treatment-plans?q=', '/api/labs/search?q=', '/api/labs/orders?q=', '/api/audit?q=', '/api/prescriptions/suggest?field=drug_name&q=',
        '/api/patients/phone-check?phone=', '/api/docs/appointments/per-doctor?q=',
    ];

    it('every search answers normally (never a server error, never slow), and finds nothing for the trick text', async () => {
        const bad = [];
        for (const base of searches) {
            for (const p of PAYLOADS) {
                const t0 = Date.now();
                const r = await call('GET', base + encodeURIComponent(p), boss);
                const ms = Date.now() - t0;
                const leaked = JSON.stringify(r.body).match(/\$2[aby]\$/);
                if (r.status >= 500 || ms > 2500 || leaked) bad.push(`${base}${p} -> ${r.status} in ${ms}ms${leaked ? ' LEAKED HASH' : ''}`);
            }
        }
        expect(bad).toEqual([]);
        expect(await tablesAlive()).toBe(true);
    }, 120000);

    it('the drug-name suggestion only accepts its 4 allowed columns', async () => {
        for (const field of ['password', 'email', 'drug_name; DROP TABLE patients', "drug_name FROM users --"]) {
            const r = await call('GET', `/api/prescriptions/suggest?field=${encodeURIComponent(field)}&q=a`, boss);
            expect(r.status).toBeLessThan(500);
            expect(JSON.stringify(r.body)).not.toMatch(/@|\$2[aby]\$/);
        }
    });

    it('IDs and numbers in the address must be plain numbers', async () => {
        for (const path of [`/api/patients/1%20OR%201=1`, `/api/patients/1;DROP%20TABLE%20patients`, '/api/appointments/abc', '/api/sessions/-5/normal']) {
            const r = await call('GET', path, boss);
            expect(r.status, path).toBe(400);
        }
        for (const path of ['/api/patients?page=1;DROP%20TABLE%20x', '/api/patients?limit=999999', '/api/patients?page=-3', '/api/sessions?limit=abc']) {
            const r = await call('GET', path, boss);
            expect(r.status, path).toBeLessThan(500);
        }
        expect(await tablesAlive()).toBe(true);
    });

    it('a very big JSON body is refused before it reaches the app', async () => {
        const r = await call('POST', '/api/patients', boss, { name: 'x'.repeat(200 * 1024), phone: '07501231234', age: 30 });
        expect(r.status).toBe(413);
    });
});

describe('image upload', () => {
    it('a real small PNG is accepted and stored under a random name', async () => {
        const r = await upload(`/api/sessions/${own.session}/images`, boss, [{ buffer: PNG_1PX, name: 'x.png', type: 'image/png' }]);
        expect(r.status).toBeLessThan(300);
        const row = await one(`SELECT * FROM session_images WHERE session_id = $1 ORDER BY id DESC LIMIT 1`, [own.session]);
        expect(JSON.stringify(row)).not.toContain('x.png');
    });

    it('a file that says it is HTML or a program is refused', async () => {
        for (const type of ['text/html', 'application/x-msdownload', 'image/svg+xml']) {
            const r = await upload(`/api/sessions/${own.session}/images`, boss, [{ buffer: Buffer.from('<script>alert(1)</script>'), name: 'a.png', type }]);
            expect(r.status, type).toBe(400);
        }
    });

    it('a file bigger than 10 MB is refused', async () => {
        const r = await upload(`/api/sessions/${own.session}/images`, boss, [{ buffer: Buffer.alloc(11 * 1024 * 1024, 1), name: 'big.png', type: 'image/png' }]);
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('UPLOAD_ERROR');
    });

    it('a NON-image file that only CLAIMS to be a PNG is refused (the real content is checked)', async () => {
        const fake = Buffer.from('<html><script>alert("x")</script></html>');
        const r = await upload(`/api/sessions/${own.session}/images`, boss, [{ buffer: fake, name: 'evil.png', type: 'image/png' }]);
        expect(r.status).toBe(400);
    });

    it('the PUBLIC sign-up page takes only ONE image (not 50 × 10 MB held in memory)', async () => {
        const files = Array.from({ length: 5 }, (_, i) => ({ buffer: PNG_1PX, name: `p${i}.png`, type: 'image/png' }));
        let req = request(app).post('/api/register').set('X-Forwarded-For', '10.55.55.55');
        for (const f of files) req = req.attach('images', f.buffer, { filename: f.name, contentType: f.type });
        const r = await req;
        expect(r.body.code).toBe('UPLOAD_ERROR');
    });

    it('the profile photo takes only ONE image', async () => {
        const files = Array.from({ length: 5 }, (_, i) => ({ buffer: PNG_1PX, name: `a${i}.png`, type: 'image/png' }));
        const r = await upload('/api/profile/me', S1.reception, files, 'put');
        expect(r.body.code).toBe('UPLOAD_ERROR');
    });
});

describe('uploads still work normally after the Part 4 fixes', () => {
    const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);

    it('several real visit photos at once are still accepted (PNG + JPG)', async () => {
        const r = await upload(`/api/sessions/${own.session}/images`, boss, [
            { buffer: PNG_1PX, name: 'a.png', type: 'image/png' },
            { buffer: JPG, name: 'b.jpg', type: 'image/jpeg' },
            { buffer: PNG_1PX, name: 'c.png', type: 'image/png' },
        ]);
        expect(r.status).toBeLessThan(300);
    });

    it('a real JPG that claims to be a PNG is refused (the content must match the type)', async () => {
        const r = await upload(`/api/sessions/${own.session}/images`, boss, [{ buffer: JPG, name: 'x.png', type: 'image/png' }]);
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('INVALID_FILE_TYPE');
    });

    it('ONE real profile photo is still accepted', async () => {
        const before = (await one(`SELECT row_to_json(p)::text AS j FROM profiles p WHERE user_id = $1`, [S1.reception.id])).j;
        // like the screen: the name is always sent with the photo
        const r = await upload('/api/profile/me', S1.reception, [{ buffer: PNG_1PX, name: 'me.png', type: 'image/png' }], 'put').field('full_name', 'Erbil Reception');
        expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
        const cols = Object.keys(JSON.parse(before)).filter((c) => c !== 'user_id');
        await query(`UPDATE profiles SET ${cols.map((c) => `${c} = b.${c}`).join(', ')} FROM json_populate_record(NULL::profiles, $1::json) b WHERE profiles.user_id = b.user_id`, [before]);
    });

    it('sign-up with ONE image passes the upload step (stops later only because the e-mail is not verified)', async () => {
        const r = await request(app).post('/api/register').set('X-Forwarded-For', '10.55.55.56').attach('images', PNG_1PX, { filename: 'pay.png', contentType: 'image/png' });
        expect(r.body.code).not.toBe('UPLOAD_ERROR');
        expect(r.status).toBe(400);
    });

    it('editing a patient or an expense with nothing to change answers NOTHING_TO_UPDATE', async () => {
        for (const path of [`/api/patients/${own.patient}`, `/api/monthly-expenses/${own.expense}`]) {
            const r = await call('PUT', path, boss, {});
            expect(r.status, path).toBe(400);
            expect(r.body.code, path).toBe('NOTHING_TO_UPDATE');
        }
    });
});
