import branchDashboardModel from '../models/branchDashboardModel.js';

// Clinic time is UTC+3 (same as the clinic overview in tenantService).
const CLINIC_TZ_OFFSET_HOURS = 3;
const DAY_MS = 24 * 3600 * 1000;
const BUSY_DAYS = 28; // 4 full weeks: every weekday is counted 4 times

// Window edges as UTC dates for the clinic's local today / this month / last month.
// "Last month to date" ends at the same point of last month (never past its end),
// so the month-vs-month comparison is fair while this month is still running.
function ranges() {
    const now = new Date();
    const offsetMs = CLINIC_TZ_OFFSET_HOURS * 3600 * 1000;
    const wall = new Date(now.getTime() + offsetMs);
    const y = wall.getUTCFullYear();
    const m = wall.getUTCMonth();
    const todayStart = new Date(Date.UTC(y, m, wall.getUTCDate()) - offsetMs);
    const monthStart = new Date(Date.UTC(y, m, 1) - offsetMs);
    const lastMonthStart = new Date(Date.UTC(y, m - 1, 1) - offsetMs);
    const sameEnd = lastMonthStart.getTime() + (now.getTime() - monthStart.getTime());
    return {
        now,
        todayStart,
        todayEnd: new Date(todayStart.getTime() + DAY_MS),
        monthStart,
        lastMonthStart,
        lastMonthSameEnd: new Date(Math.min(sameEnd, monthStart.getTime())),
        busySince: new Date(todayStart.getTime() - (BUSY_DAYS - 1) * DAY_MS),
    };
}

const countStatus = (list, status) => list.filter((a) => a.status === status).length;

// % change from last month (same days) to this month; null when last month had nothing
function changePercent(now, before) {
    if (!before) return null;
    return Math.round(((now - before) / before) * 100);
}

function revenueRows(rows) {
    return rows.map((r) => {
        const thisMonth = Number(r.this_month);
        const lastToDate = Number(r.last_month_to_date);
        return {
            currency_code: r.currency_code,
            this_month: thisMonth,
            last_month_to_date: lastToDate,
            last_month: Number(r.last_month),
            change_percent: changePercent(thisMonth, lastToDate),
        };
    });
}

function unpaidRows(rows) {
    const map = new Map();
    for (const r of rows) {
        const row = map.get(r.currency_code) || {
            currency_code: r.currency_code,
            visits: { count: 0, total: 0 },
            plans: { count: 0, total: 0 },
        };
        row[r.kind] = { count: r.count, total: Number(r.total) };
        map.set(r.currency_code, row);
    }
    return [...map.values()];
}

function doctorRows(work, income) {
    return work.map((d) => ({
        ...d,
        income: income
            .filter((i) => Number(i.doctor_id) === Number(d.doctor_id))
            .map((i) => ({ currency_code: i.currency_code, total: Number(i.total) }))
            .sort((a, b) => a.currency_code.localeCompare(b.currency_code)),
    }));
}

// busy[dow] = appointments on that weekday; hours = [{ hour, total }] for hours with appointments
function busyRows(rows) {
    const days = [0, 0, 0, 0, 0, 0, 0];
    const hours = new Map();
    for (const r of rows) {
        days[r.dow] += r.total;
        hours.set(r.hour, (hours.get(r.hour) || 0) + r.total);
    }
    return {
        days_back: BUSY_DAYS,
        days,
        hours: [...hours.entries()].map(([hour, total]) => ({ hour, total })).sort((a, b) => a.hour - b.hour),
    };
}

async function getDashboard(tenant_id, branch_id) {
    const r = ranges();
    const [counts, list, revenue, unpaid, work, income, busy, treatments] = await Promise.all([
        branchDashboardModel.getCounts(r.todayStart, r.todayEnd, tenant_id, branch_id),
        branchDashboardModel.getTodayAppointments(r.todayStart, r.todayEnd, tenant_id, branch_id),
        branchDashboardModel.getRevenueWindows(r, tenant_id, branch_id),
        branchDashboardModel.getUnpaid(tenant_id, branch_id),
        branchDashboardModel.getDoctorWork(r.monthStart, r.now, tenant_id, branch_id),
        branchDashboardModel.getDoctorIncome(r.monthStart, r.now, tenant_id, branch_id),
        branchDashboardModel.getBusyTimes(r.busySince, r.now, tenant_id, branch_id),
        branchDashboardModel.getTreatments(r.monthStart, r.now, tenant_id, branch_id),
    ]);

    return {
        branch_id: Number(branch_id),
        new_patients: counts.new_patients,
        returning_patients: counts.returning_patients,
        team_members: counts.team_members,
        today_appointments: {
            total: list.length,
            done: countStatus(list, 'completed'),
            scheduled: countStatus(list, 'scheduled'),
            list,
        },
        revenue: revenueRows(revenue),
        unpaid: unpaidRows(unpaid),
        doctors: doctorRows(work, income),
        busy: busyRows(busy),
        treatments_month: treatments,
    };
}

export default { getDashboard }
