// Shared helpers for API tests: call the app as any made-up user, read the test database,
// and create / remove test visits that are marked so they can always be cleaned up.
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../main.js';
import pool from '../../db_connection.js';

export const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
export const all = async (sql, params) => (await pool.query(sql, params)).rows;
export const query = (sql, params) => pool.query(sql, params);

// the same token the login endpoint gives (id + clinic + branch)
export const tokenFor = (user) =>
    jwt.sign({ id: user.id, tenant_id: user.tenant_id, branch_id: user.branch_id }, process.env.JWT_SECRET, { expiresIn: '30m' });

// call an endpoint as a user (or with no user) -> { status, body }
export function call(method, path, user, body) {
    let req = request(app)[method.toLowerCase()](path);
    if (user) req = req.set('Authorization', `Bearer ${tokenFor(user)}`);
    return body === undefined ? req : req.send(body);
}

// a made-up clinic from tests/seed/seedTestClinics.js, by its e-mail domain (e.g. "smile.example.com")
export async function loadClinic(domain) {
    const rows = await all(`
        SELECT u.id, u.email, u.tenant_id, ubr.branch_id, r.name AS role
          FROM users u
          JOIN user_branch_roles ubr ON ubr.user_id = u.id AND ubr.is_active
          JOIN roles r ON r.id = ubr.role_id
         WHERE u.email LIKE $1
         ORDER BY ubr.branch_id NULLS FIRST, u.id`, [`%@${domain}`]);
    if (!rows.length) throw new Error(`Test clinic "${domain}" not found. Run: npm run seed:test`);
    const user = (r, branch_id) => ({ id: Number(r.id), email: r.email, tenant_id: Number(r.tenant_id), branch_id: Number(branch_id) });
    const branchIds = [...new Set(rows.filter((r) => r.branch_id).map((r) => Number(r.branch_id)))];
    const managerRow = rows.find((r) => r.role === 'tenant_manager');
    return {
        tenant_id: Number(rows[0].tenant_id),
        // the clinic manager has no fixed branch; he works "inside" the first one unless told otherwise
        manager: user(managerRow, branchIds[0]),
        managerIn: (branch_id) => user(managerRow, branch_id),
        branches: branchIds.map((branch_id) => {
            const of = (role) => rows.filter((r) => Number(r.branch_id) === branch_id && r.role === role).map((r) => user(r, branch_id));
            return { id: branch_id, tenant_id: Number(rows[0].tenant_id), manager: of('branch_manager')[0], doctors: of('doctor'), reception: of('reception')[0] };
        }),
    };
}

// a visit in progress, marked (appointments.complaint) so the test can remove it afterwards
export async function newTestVisit(marker, branch, { patient_id, doctor_id } = {}) {
    const patient = patient_id ?? Number((await one(`SELECT id FROM patients WHERE tenant_id = $1 AND branch_id = $2 ORDER BY id LIMIT 1`, [branch.tenant_id, branch.id])).id);
    const doctor = doctor_id ?? branch.doctors[0].id;
    const row = await one(`
        INSERT INTO appointments (patient_id, doctor_id, scheduled_start, status, check_in_time, started_at, tenant_id, branch_id, created_by, complaint)
        VALUES ($1, $2, NOW(), 'in_progress', NOW(), NOW(), $3, $4, $5, $6) RETURNING id`,
        [patient, doctor, branch.tenant_id, branch.id, branch.reception.id, marker]);
    return Number(row.id);
}

// remove every visit marked by a test, with its session, works, payments, prescriptions and plans
export async function removeTestVisits(marker) {
    const ids = (await all(`SELECT id FROM appointments WHERE complaint = $1`, [marker])).map((x) => Number(x.id));
    if (!ids.length) return 0;
    const sessionIds = (await all(`SELECT id FROM sessions WHERE appointment_id = ANY($1::int[])`, [ids])).map((x) => Number(x.id));
    const planIds = (await all(`SELECT DISTINCT treatment_plan_id AS id FROM session_works
                                 WHERE session_id = ANY($1::int[]) AND treatment_plan_id IS NOT NULL`, [sessionIds])).map((x) => Number(x.id));
    await query(`DELETE FROM treatment_payments WHERE session_id = ANY($1::int[]) OR treatment_plan_id = ANY($2::int[])`, [sessionIds, planIds]);
    await query(`DELETE FROM session_payments WHERE session_id = ANY($1::int[])`, [sessionIds]);
    await query(`DELETE FROM session_works WHERE session_id = ANY($1::int[])`, [sessionIds]);
    await query(`DELETE FROM prescription_items WHERE prescription_id IN (SELECT id FROM prescriptions WHERE appointment_id = ANY($1::int[]))`, [ids]);
    await query(`DELETE FROM prescriptions WHERE appointment_id = ANY($1::int[])`, [ids]);
    await query(`DELETE FROM sessions WHERE id = ANY($1::int[])`, [sessionIds]);
    await query(`DELETE FROM treatment_plans WHERE id = ANY($1::int[])`, [planIds]);
    await query(`DELETE FROM appointments WHERE id = ANY($1::int[])`, [ids]);
    return ids.length;
}

// save a branch's workflow rules row and give back a function that puts it back exactly
export async function keepWorkflow(branch) {
    const before = await one(`SELECT * FROM branch_workflow WHERE tenant_id = $1 AND branch_id = $2`, [branch.tenant_id, branch.id]);
    return async () => {
        await query(`DELETE FROM branch_workflow WHERE tenant_id = $1 AND branch_id = $2`, [branch.tenant_id, branch.id]);
        if (before) {
            const cols = Object.keys(before);
            await query(`INSERT INTO branch_workflow (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(before));
        }
    };
}
