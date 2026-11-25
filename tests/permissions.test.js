// PART 3 — Roles & permissions.  REPORT MODE: failing tests = findings (no app code changed for Part 3).
// 1. Every endpoint, read straight from the route files, is called by each of the 4 roles of "Test Smile" branch 1:
//    a role WITHOUT the required permission must get the permission refusal; a role WITH it must never get it.
// 2. Ways to climb higher than you are (give yourself or others more power) must be refused.
// 3. "Own only" ticks, instant effect of changes, inactive assignments.
// Uses made-up data; everything changed is put back.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { call, one, all, query, loadClinic, newTestVisit, removeTestVisits } from './helpers/testApp.js';

const PERMISSION_REFUSAL = "You don't have permission for this route!";
const FAKE_ID = '999999999';
let smile, S1, roles, routes;

// ---- read every route + the permission it needs, from the route files themselves ----
function readRoutes() {
    const root = path.resolve('routes');
    const main = fs.readFileSync(path.resolve('main.js'), 'utf8');
    const fileOf = Object.fromEntries([...main.matchAll(/import (\w+) from ['"]\.\/routes\/(\w+)\.js['"]/g)].map((m) => [m[1], m[2]]));
    const mounts = [...main.matchAll(/app\.use\((?:['"]([^'"]+)['"],\s*)?(\w+Route)\)/g)].map((m) => ({ prefix: m[1] || '', file: fileOf[m[2]] }));
    const out = [];
    for (const { prefix, file } of mounts) {
        // code only: comments (// ... and /* ... */) are removed so words inside them are never read as guards
        const text = fs.readFileSync(path.join(root, `${file}.js`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
        const named = Object.fromEntries([...text.matchAll(/const (\w+) = permission(?:Middleware|Check)\(([^)]*)\)/g)].map((m) => [m[1], m[2]]));
        const keysIn = (s) => [...s.matchAll(/permission(?:Middleware|Check)\(([^)]*)\)/g)].flatMap((m) => [...m[1].matchAll(/['"](\w+)['"]/g)].map((k) => k[1]))
            .concat(Object.entries(named).filter(([n]) => new RegExp(`\\b${n}\\b`).test(s)).flatMap(([, a]) => [...a.matchAll(/['"](\w+)['"]/g)].map((k) => k[1])));
        const fileLevel = [...text.matchAll(/router\.use\(([^\n]*)\)/g)].map((m) => m[1]).join(' ');
        const needAuth = /authMiddleware/.test(fileLevel);
        // one route = from its "router.<method>(" up to the next "router." (some files leave out the ";")
        const starts = [...text.matchAll(/router\.(get|post|put|patch|delete)\(\s*(['"`])(.*?)\2/g)];
        for (const [i, m] of starts.entries()) {
            const [, method, , sub] = m;
            const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
            const rest = text.slice(m.index + m[0].length, end);
            out.push({
                method: method.toUpperCase(),
                path: `${prefix}${sub === '/' ? '' : sub}` || '/',
                needs: [...new Set([...keysIn(fileLevel), ...keysIn(rest)])],
                auth: needAuth || /authMiddleware/.test(rest),
                file,
            });
        }
    }
    return out;
}
const fill = (p) => p.replace(/:\w+/g, FAKE_ID);

beforeAll(async () => {
    smile = await loadClinic('smile.example.com');
    S1 = smile.branches[0];
    const who = { tenant_manager: smile.manager, branch_manager: S1.manager, doctor: S1.doctors[0], reception: S1.reception };
    roles = {};
    for (const [name, user] of Object.entries(who)) {
        const me = await call('GET', '/me', user);
        roles[name] = { user, permissions: me.body.user.permissions };
    }
    routes = readRoutes();
}, 60000);

describe('every endpoint × every role', () => {
    it('the route files were read (sanity)', () => {
        expect(routes.length).toBeGreaterThan(180);
        expect(routes.filter((r) => r.needs.length).length).toBeGreaterThan(120);
    });

    for (const roleName of ['tenant_manager', 'branch_manager', 'doctor', 'reception']) {
        it(`${roleName}: refused exactly where the permission is missing, never refused where it is held`, async () => {
            const { user, permissions } = roles[roleName];
            const wrong = [];
            for (const r of routes.filter((x) => x.needs.length && x.auth)) {
                const allowed = r.needs.some((k) => permissions.includes(k));
                const res = await call(r.method, fill(r.path), user, ['POST', 'PUT', 'PATCH'].includes(r.method) ? {} : undefined);
                const refused = res.status === 403 && res.body?.message === PERMISSION_REFUSAL;
                if (allowed === refused) wrong.push(`${r.method} ${r.path} needs [${r.needs}] -> ${res.status} ${allowed ? '(should pass the permission check)' : '(should be refused)'}`);
            }
            expect(wrong).toEqual([]);
        }, 120000);
    }

    it('no clinic role ever holds the platform-owner permission', () => {
        for (const { permissions } of Object.values(roles)) expect(permissions).not.toContain('manage_system');
    });

    it('the only endpoints that need just a login (no permission) are "your own" pages and harmless reads', () => {
        // checked one by one (2026-11-24): a NEW endpoint without a permission makes this test fail, so it gets looked at
        const open = routes.filter((r) => r.auth && !r.needs.length).map((r) => `${r.method} ${r.path}`);
        expect(open.sort()).toEqual([
            'GET /api/announcements/me', 'GET /api/notifications', 'GET /api/plans', 'GET /api/plans/:planId', 'GET /api/profile/me',
            'GET /api/profile/me/design', 'GET /api/settings/effective', 'GET /api/settings/workflow', 'GET /api/subscriptions/me',
            'GET /api/subscriptions/me/features', 'GET /me', 'POST /api/announcements/:id/read', 'POST /api/notifications/:id/read',
            'POST /api/profile/me/email/send-code', 'POST /switch-branch', 'PUT /api/notifications/read-all', 'PUT /api/profile/me',
            'PUT /api/profile/me/design', 'PUT /api/profile/me/email', 'PUT /api/profile/me/password',
        ].sort());
    });
});

describe('climbing higher than you are', () => {
    let restoreTicks;
    beforeAll(async () => {
        const before = await all(`SELECT * FROM branch_role_permissions WHERE tenant_id = $1 AND branch_id = $2`, [smile.tenant_id, S1.id]);
        restoreTicks = async () => {
            await query(`DELETE FROM branch_role_permissions WHERE tenant_id = $1 AND branch_id = $2`, [smile.tenant_id, S1.id]);
            for (const row of before) {
                const cols = Object.keys(row);
                await query(`INSERT INTO branch_role_permissions (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
            }
        };
    });
    afterAll(async () => { await restoreTicks(); });

    const receptionKeys = () => roles.reception.permissions;

    it('a branch manager cannot give a role a permission he does not have himself', async () => {
        for (const key of ['manage_users', 'view_audit_log', 'manage_subscription']) {
            const r = await call('PUT', '/api/role-permissions/4', S1.manager, { permissions: [...receptionKeys(), key] });
            expect(r.status).toBeGreaterThanOrEqual(400);
            expect(await one(`SELECT 1 AS x FROM branch_role_permissions b JOIN permissions p ON p.id = b.permission_id WHERE b.role_id = 4 AND b.branch_id = $1 AND p.key = $2`, [S1.id, key])).toBeUndefined();
        }
    });

    it('nobody can tick the platform-owner permission on a role', async () => {
        const r = await call('PUT', '/api/role-permissions/4', smile.manager, { permissions: [...receptionKeys(), 'manage_system'] });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(await one(`SELECT 1 AS x FROM branch_role_permissions b JOIN permissions p ON p.id = b.permission_id WHERE b.role_id = 4 AND b.branch_id = $1 AND p.key = 'manage_system'`, [S1.id])).toBeUndefined();
    });

    it('a branch manager cannot change his own role', async () => {
        const r = await call('PUT', '/api/role-permissions/2', S1.manager, { permissions: ['view_patient'] });
        expect(r.status).toBe(403);
    });

    it('the clinic-owner role cannot be edited, renamed or deleted', async () => {
        expect((await call('PUT', '/api/role-permissions/1', smile.manager, { permissions: [] })).status).toBe(403);
        expect((await call('PATCH', '/api/role-permissions/1', smile.manager, { name: 'Owner hacked' })).status).toBeGreaterThanOrEqual(400);
        expect((await call('DELETE', '/api/role-permissions/1', smile.manager)).status).toBeGreaterThanOrEqual(400);
    });

    it('[REVIEW] who can give a user the clinic-OWNER role (only the owner should)', async () => {
        // the branch manager has no manage_users, so only the owner can create staff at all
        const r = await call('POST', '/api/users', S1.manager, { branch_id: S1.id, email: 'owner-try@smile.example.com', password: 'Test12345!', confirmPassword: 'Test12345!', role_id: 1, full_name: 'x' });
        expect(r.status).toBe(403);
    });

    it('a permission removed from a role stops working at once, with the same login', async () => {
        expect((await call('GET', '/api/patients', S1.reception)).status).toBe(200);
        await call('PUT', '/api/role-permissions/4', S1.manager, { permissions: receptionKeys().filter((k) => k !== 'view_patient') });
        expect((await call('GET', '/api/patients', S1.reception)).status).toBe(403);
        await restoreTicks();
        expect((await call('GET', '/api/patients', S1.reception)).status).toBe(200);
    });

    it('"own only": a receptionist with "view patients: own" sees only the patients she added, and gets 404 for others', async () => {
        const r = await call('PUT', '/api/role-permissions/4', S1.manager, { permissions: receptionKeys(), scopes: { view_patient: 'own' } });
        expect(r.status).toBe(200);
        const list = await call('GET', '/api/patients?limit=100', S1.reception);
        const mine = Number((await one(`SELECT count(*) AS n FROM patients WHERE branch_id = $1 AND created_by = $2`, [S1.id, S1.reception.id])).n);
        expect(list.status).toBe(200);
        expect(Number(list.body.total)).toBe(mine);
        const someoneElses = await one(`SELECT id FROM patients WHERE branch_id = $1 AND created_by <> $2 LIMIT 1`, [S1.id, S1.reception.id]);
        if (someoneElses) expect((await call('GET', `/api/patients/${someoneElses.id}`, S1.reception)).status).toBe(404);
        await restoreTicks();
    });
});

describe('assignments', () => {
    it('a staff member whose role in the branch is switched off is refused at once', async () => {
        await query(`UPDATE user_branch_roles SET is_active = false WHERE user_id = $1 AND branch_id = $2`, [S1.doctors[1].id, S1.id]);
        try {
            const r = await call('GET', '/api/appointments', S1.doctors[1]);
            expect(r.status).toBe(403);
        } finally {
            await query(`UPDATE user_branch_roles SET is_active = true WHERE user_id = $1 AND branch_id = $2`, [S1.doctors[1].id, S1.id]);
        }
    });

    it('a clinic whose subscription expired can only reach its renewal pages', async () => {
        const sub = await one(`SELECT id, end_date FROM subscriptions WHERE tenant_id = $1`, [smile.tenant_id]);
        await query(`UPDATE subscriptions SET end_date = NOW() - INTERVAL '1 day' WHERE id = $1`, [sub.id]);
        try {
            const blocked = await call('GET', '/api/patients', S1.reception);
            expect(blocked.status).toBe(403);
            expect(blocked.body.code).toBe('SUBSCRIPTION_EXPIRED');
            expect((await call('GET', '/api/subscriptions/me', smile.manager)).status).toBe(200);
        } finally {
            await query(`UPDATE subscriptions SET end_date = $2 WHERE id = $1`, [sub.id, sub.end_date]);
        }
    });
});

// decided by the owner (2026-11-24): plans are managed with "manage_tp"; each clinic unticks it per role if it wants
describe('money power of the default roles (by design)', () => {
    it('"manage plans" lets a role void a plan and change its agreed price; reception and doctors have it by default', () => {
        const deleteNeeds = routes.find((r) => r.method === 'DELETE' && r.path === '/api/treatment-plans/:treatmentPlanId').needs;
        const editNeeds = routes.find((r) => r.method === 'PATCH' && r.path === '/api/treatment-plans/:treatmentPlanId').needs;
        expect(deleteNeeds).toEqual(['manage_tp']);
        expect(editNeeds).toEqual(['manage_tp']);
        for (const role of ['reception', 'doctor']) expect(roles[role].permissions).toContain('manage_tp');
    });
});

describe('finishing a visit', () => {
    const MARK = 'test-permissions-finish';
    let normalWork;
    const visitOf = (doctor) => newTestVisit(MARK, S1, { doctor_id: doctor.id });
    const finish = (appt, user) => call('POST', `/api/appointments/${appt}/completed`, user, { works: [{ work_id: normalWork, quantity: 1, tooth_number: 11 }] });
    const statusOf = async (appt) => (await one(`SELECT status FROM appointments WHERE id = $1`, [appt])).status;
    beforeAll(async () => { normalWork = Number((await one(`SELECT id FROM work_catalog WHERE branch_id = $1 AND code = 'FILLING'`, [S1.id])).id); });
    afterAll(async () => { await removeTestVisits(MARK); });

    it("a doctor (default: sees only his own appointments) cannot even open another doctor's visit (404)", async () => {
        const appt = await visitOf(S1.doctors[1]);
        expect((await finish(appt, S1.doctors[0])).status).toBe(404);
        expect(await statusOf(appt)).toBe('in_progress');
    });

    it("a doctor switched to 'all appointments' still CANNOT finish another doctor's visit (NOT_YOUR_VISIT), nothing saved", async () => {
        const doctorKeys = roles.doctor.permissions;
        const ticks = await all(`SELECT * FROM branch_role_permissions WHERE tenant_id = $1 AND branch_id = $2 AND role_id = 3`, [smile.tenant_id, S1.id]);
        const set = await call('PUT', '/api/role-permissions/3', S1.manager, { permissions: doctorKeys, scopes: { view_patient: 'own', view_session: 'own', view_appointment: 'all' } });
        expect(set.status).toBe(200);
        try {
            const appt = await visitOf(S1.doctors[1]);
            const r = await finish(appt, S1.doctors[0]);
            expect(r.status).toBe(403);
            expect(r.body.code).toBe('NOT_YOUR_VISIT');
            expect(await statusOf(appt)).toBe('in_progress');
            expect(await one(`SELECT id FROM sessions WHERE appointment_id = $1`, [appt])).toBeUndefined();
        } finally {
            await query(`DELETE FROM branch_role_permissions WHERE tenant_id = $1 AND branch_id = $2 AND role_id = 3`, [smile.tenant_id, S1.id]);
            for (const row of ticks) {
                const cols = Object.keys(row);
                await query(`INSERT INTO branch_role_permissions (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
            }
        }
    });

    it('a doctor CAN finish his own visit', async () => {
        const appt = await visitOf(S1.doctors[0]);
        expect((await finish(appt, S1.doctors[0])).status).toBe(200);
        expect(await statusOf(appt)).toBe('completed');
    });

    it("managers can still finish any doctor's visit; reception has no 'finish visit' permission at all", async () => {
        for (const user of [S1.manager, smile.manager]) {
            const appt = await visitOf(S1.doctors[1]);
            expect((await finish(appt, user)).status).toBe(200);
        }
        const appt = await visitOf(S1.doctors[1]);
        expect((await finish(appt, S1.reception)).status).toBe(403);
    });
});
