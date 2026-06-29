import reportsModel from '../models/reportsModel.js'
import resolveReportDateRange from '../utils/reportsDateRange.js'

/**
 * INSIGHTS ASSISTANT SERVICE
 * --------------------------------------------------------------------------
 * Powers the tenant_manager "assistant" widget. Every answer comes from a
 * tested, read-only, tenant-scoped query — never from free-text SQL.
 *
 * The METRICS registry below is the single source of truth: each entry is one
 * question the user can click. It is also the exact structure an AI layer would
 * use later — the AI would only need to map a typed question to a metric id and
 * call runInsight(). Nothing else would change. That is why the question logic
 * lives in this registry and not scattered across controllers.
 *
 * Shapes returned to the frontend:
 *   - count    → { unit, value, branches:[{branch_name,value}], compare? }
 *   - revenue  → same as count, unit:'money'
 *   - breakdown→ { unit, value, breakdown:[{label,value,rate}], branches:[...] }
 *   - split    → { unit, items:[{label,value,rate}], branches:[...], compare? }
 * rate meaning: share % on breakdowns/splits, growth % on compares.
 */

// ---- small helpers --------------------------------------------------------

function round1(n) {
    return Math.round(Number(n || 0) * 10) / 10;
}

function sumField(rows, key = 'total') {
    if (!Array.isArray(rows)) return 0;
    return rows.reduce((acc, r) => acc + Number(r[key] || 0), 0);
}

// Growth % vs a previous value. Returns null when there is no baseline (prev = 0)
// so the UI shows "—" instead of a misleading "+100%".
function growthRate(current, previous) {
    if (!previous) return null;
    return round1(((current - previous) / previous) * 100);
}

// COUNT/REVENUE shaping: rows = [{ branch_name, total }]
// Always lists every branch (0 for branches with no activity in the period).
function shapeCount(rows, branches, unit = 'count') {
    const perBranch = branches.map((b) => ({
        branch_name: b.name,
        value: Number(rows.find((r) => r.branch_name === b.name)?.total || 0),
    }));
    return { unit, value: sumField(rows, 'total'), branches: perBranch };
}

// BREAKDOWN shaping: rows = [{ branch_name, label, total }]
// Builds a combined breakdown (across branches) + a per-branch breakdown, each
// item carrying its share %. Optionally trims to top/bottom 1 (most/least) or
// top N (e.g. top-5 cancel reasons).
function shapeBreakdown(rows, branches, { unit = 'count', pick = 'all', limit = null } = {}) {
    const combinedMap = new Map();
    for (const r of rows) {
        combinedMap.set(r.label, (combinedMap.get(r.label) || 0) + Number(r.total || 0));
    }
    const grand = [...combinedMap.values()].reduce((a, v) => a + v, 0);

    let breakdown = [...combinedMap.entries()]
        .map(([label, value]) => ({ label, value, rate: grand ? round1((value / grand) * 100) : 0 }))
        .sort((a, b) => b.value - a.value);

    breakdown = applyPick(breakdown, pick, limit);

    const perBranch = branches.map((b) => {
        const brRows = rows.filter((r) => r.branch_name === b.name);
        const brTotal = sumField(brRows, 'total');
        let items = brRows
            .map((r) => ({
                label: r.label,
                value: Number(r.total || 0),
                rate: brTotal ? round1((Number(r.total) / brTotal) * 100) : 0,
            }))
            .sort((a, b) => b.value - a.value);
        items = applyPick(items, pick, limit);
        return { branch_name: b.name, value: brTotal, breakdown: items };
    });

    return { unit, value: grand, breakdown, branches: perBranch };
}

function applyPick(list, pick, limit) {
    if (pick === 'top') return list.slice(0, 1);
    if (pick === 'bottom') return list.length ? [list[list.length - 1]] : [];
    if (limit) return list.slice(0, limit);
    return list;
}

// ---- period resolution ----------------------------------------------------

// Resolve the main period (reuses the existing report date helper).
async function resolvePeriod(query) {
    return resolveReportDateRange({ month: query.month, from: query.from, to: query.to });
}

// Resolve the comparison period when the user asks to compare:
//  - explicit compareFrom/compareTo or compareMonth → use them
//  - compare flag only → the equivalent window immediately before the main one
async function resolveComparePeriod(query, mainPeriod) {
    if (query.compareFrom && query.compareTo) {
        return resolveReportDateRange({ from: query.compareFrom, to: query.compareTo });
    }
    if (query.compareMonth) {
        return resolveReportDateRange({ month: query.compareMonth });
    }
    if (query.compare === 'true' || query.compare === '1' || query.compare === true) {
        const span = new Date(mainPeriod.to).getTime() - new Date(mainPeriod.from).getTime();
        const prevTo = new Date(mainPeriod.from);
        const prevFrom = new Date(new Date(mainPeriod.from).getTime() - span);
        return { from: prevFrom, to: prevTo, label: 'Previous period', rangeText: 'previous equivalent period' };
    }
    return null;
}

// ---- the metric registry --------------------------------------------------
// type: count | revenue | breakdown | split
// supportsCompare: growth vs another period (counts/revenue/split only).

const METRICS = {
    // ---------------- PATIENTS ----------------
    patients_new: {
        category: 'patients', label: 'New patients', type: 'count', supportsCompare: true,
        fetch: (p, t) => reportsModel.registeredPatientByBranch(p.from, p.to, t),
    },
    patients_returning: {
        category: 'patients', label: 'Returning patients', type: 'count', supportsCompare: true,
        fetch: (p, t) => reportsModel.returningPatientsByBranch(p.from, p.to, t),
    },
    patients_new_vs_returning: {
        category: 'patients', label: 'New vs returning', type: 'split', supportsCompare: true,
    },
    patients_age_all: {
        category: 'patients', label: 'Patients by age (overall)', type: 'breakdown',
        fetch: (p, t) => reportsModel.patientsByAgeBucketByBranch(null, null, t),
    },
    patients_age_month: {
        category: 'patients', label: 'Patients by age (this period)', type: 'breakdown',
        fetch: (p, t) => reportsModel.patientsByAgeBucketByBranch(p.from, p.to, t),
    },
    patients_referral: {
        category: 'patients', label: 'Referral source', type: 'breakdown',
        fetch: (p, t) => reportsModel.referralBreakdownByBranch(p.from, p.to, t),
    },

    // ---------------- APPOINTMENTS ----------------
    appts_total: {
        category: 'appointments', label: 'Appointments', type: 'count', supportsCompare: true,
        fetch: (p, t) => reportsModel.getApptsByBranch(p.from, p.to, t),
    },
    appts_by_doctor: {
        category: 'appointments', label: 'Appointments per doctor', type: 'breakdown',
        fetch: (p, t) => mapDoctorAppts(reportsModel.apptForEachDoctorByBranch(p.from, p.to, t)),
    },
    appts_doctor_most: {
        category: 'appointments', label: 'Doctor with most appointments', type: 'breakdown', pick: 'top',
        fetch: (p, t) => mapDoctorAppts(reportsModel.apptForEachDoctorByBranch(p.from, p.to, t)),
    },
    appts_doctor_least: {
        category: 'appointments', label: 'Doctor with least appointments', type: 'breakdown', pick: 'bottom',
        fetch: (p, t) => mapDoctorAppts(reportsModel.apptForEachDoctorByBranch(p.from, p.to, t)),
    },
    appts_cancel_noshow: {
        category: 'appointments', label: 'Cancelled & no-show', type: 'breakdown',
        fetch: (p, t) => mapCancelNoShow(reportsModel.apptsDoneByStatusByBranch(p.from, p.to, t)),
    },
    appts_cancel_reasons: {
        category: 'appointments', label: 'Top cancellation reasons', type: 'breakdown', limit: 5,
        fetch: (p, t) => reportsModel.cancellationReasonsByBranch(p.from, p.to, t),
    },
    appts_followup: {
        category: 'appointments', label: 'Follow-up patients', type: 'count', supportsCompare: true,
        fetch: (p, t) => reportsModel.followUpPatientsByBranch(p.from, p.to, t),
    },

    // ---------------- TREATMENTS ----------------
    treatments_most: {
        category: 'treatments', label: 'Most done treatment', type: 'breakdown', pick: 'top',
        fetch: (p, t) => reportsModel.treatmentBreakdownByBranch(p.from, p.to, t),
    },
    treatments_least: {
        category: 'treatments', label: 'Least done treatment', type: 'breakdown', pick: 'bottom',
        fetch: (p, t) => reportsModel.treatmentBreakdownByBranch(p.from, p.to, t),
    },
    treatments_all: {
        category: 'treatments', label: 'All treatments (ranked)', type: 'breakdown',
        fetch: (p, t) => reportsModel.treatmentBreakdownByBranch(p.from, p.to, t),
    },

    // ---------------- REVENUE ----------------
    revenue_total: {
        category: 'revenue', label: 'Total revenue', type: 'revenue', supportsCompare: true,
        fetch: (p, t) => fetchRevenueTotalByBranch(p.from, p.to, t),
    },
    revenue_per_doctor: {
        category: 'revenue', label: 'Revenue per doctor', type: 'breakdown', unit: 'money',
        fetch: (p, t) => reportsModel.revenuePerDoctorByBranch(p.from, p.to, t),
    },
    revenue_per_treatment: {
        category: 'revenue', label: 'Revenue per treatment', type: 'breakdown', unit: 'money',
        fetch: (p, t) => reportsModel.revenuePerTreatmentByBranch(p.from, p.to, t),
    },
};

// ---- fetch adapters (normalise rows to { branch_name, label?, total }) -----

async function mapDoctorAppts(promise) {
    const rows = await promise;
    return rows.map((r) => ({ branch_name: r.branch_name, label: r.doctor_name, total: r.total_appointments }));
}

async function mapCancelNoShow(promise) {
    const rows = await promise;
    return rows
        .filter((r) => r.status === 'cancelled' || r.status === 'no_show')
        .map((r) => ({
            branch_name: r.branch_name,
            label: r.status === 'no_show' ? 'No-show' : 'Cancelled',
            total: r.status_total,
        }));
}

// Total revenue per branch = session payments + treatment-plan payments.
async function fetchRevenueTotalByBranch(from, to, tenant_id) {
    const [sessions, plans] = await Promise.all([
        reportsModel.sumOfSessionsAmountByBranch(from, to, tenant_id),
        reportsModel.sumOfTreatmentPlansAmountByBranch(from, to, tenant_id),
    ]);
    const names = new Set([...sessions.map((s) => s.branch_name), ...plans.map((p) => p.branch_name)]);
    return Array.from(names).map((name) => {
        const s = Number(sessions.find((i) => i.branch_name === name)?.total_paid || 0);
        const p = Number(plans.find((i) => i.branch_name === name)?.total_paid || 0);
        return { branch_name: name, total: s + p };
    });
}

// ---- public API -----------------------------------------------------------

// The catalog the frontend (and, later, the AI) reads to build the menu.
function getCatalog() {
    return Object.entries(METRICS).map(([id, m]) => ({
        id,
        category: m.category,
        label: m.label,
        type: m.type,
        unit: m.unit || (m.type === 'revenue' ? 'money' : 'count'),
        supportsCompare: !!m.supportsCompare,
    }));
}

function isValidMetric(metricId) {
    return Object.prototype.hasOwnProperty.call(METRICS, metricId);
}

// Run one question and return its shaped answer (per-branch + totals + rate).
async function runInsight(metricId, query, tenant_id) {
    const metric = METRICS[metricId];
    if (!metric) return null;

    const branches = await reportsModel.getTenantBranches(tenant_id);
    const multiBranch = branches.length > 1;
    const period = await resolvePeriod(query);

    let result;

    if (metric.type === 'split') {
        result = await runSplit(period, query, tenant_id, branches, metric);
    } else if (metric.type === 'count' || metric.type === 'revenue') {
        const unit = metric.type === 'revenue' ? 'money' : 'count';
        const rows = await metric.fetch(period, tenant_id);
        result = shapeCount(rows, branches, unit);
        if (metric.supportsCompare) {
            const cmp = await resolveComparePeriod(query, period);
            if (cmp) {
                const prevRows = await metric.fetch(cmp, tenant_id);
                const previous = sumField(prevRows, 'total');
                result.compare = {
                    previous,
                    current: result.value,
                    change: round1(result.value - previous),
                    rate: growthRate(result.value, previous),
                    period: { label: cmp.label, rangeText: cmp.rangeText },
                };
            }
        }
    } else {
        // breakdown
        const rows = await metric.fetch(period, tenant_id);
        result = shapeBreakdown(rows, branches, {
            unit: metric.unit || 'count',
            pick: metric.pick || 'all',
            limit: metric.limit || null,
        });
    }

    return {
        metricId,
        label: metric.label,
        category: metric.category,
        type: metric.type,
        multiBranch,
        period: { label: period.label, rangeText: period.rangeText },
        result,
    };
}

// New vs returning split (both counts + their shares, with optional growth).
async function runSplit(period, query, tenant_id, branches, metric) {
    const [newRows, retRows] = await Promise.all([
        reportsModel.registeredPatientByBranch(period.from, period.to, tenant_id),
        reportsModel.returningPatientsByBranch(period.from, period.to, tenant_id),
    ]);
    const newTotal = sumField(newRows, 'total');
    const retTotal = sumField(retRows, 'total');
    const grand = newTotal + retTotal;

    const items = [
        { label: 'New', value: newTotal, rate: grand ? round1((newTotal / grand) * 100) : 0 },
        { label: 'Returning', value: retTotal, rate: grand ? round1((retTotal / grand) * 100) : 0 },
    ];

    const perBranch = branches.map((b) => {
        const n = Number(newRows.find((r) => r.branch_name === b.name)?.total || 0);
        const r = Number(retRows.find((x) => x.branch_name === b.name)?.total || 0);
        const g = n + r;
        return {
            branch_name: b.name,
            value: g,
            breakdown: [
                { label: 'New', value: n, rate: g ? round1((n / g) * 100) : 0 },
                { label: 'Returning', value: r, rate: g ? round1((r / g) * 100) : 0 },
            ],
        };
    });

    const shaped = { unit: 'count', value: grand, breakdown: items, branches: perBranch };

    const cmp = await resolveComparePeriod(query, period);
    if (cmp) {
        const [pn, pr] = await Promise.all([
            reportsModel.registeredPatientByBranch(cmp.from, cmp.to, tenant_id),
            reportsModel.returningPatientsByBranch(cmp.from, cmp.to, tenant_id),
        ]);
        const prevNew = sumField(pn, 'total');
        const prevRet = sumField(pr, 'total');
        shaped.compare = {
            new: { previous: prevNew, current: newTotal, rate: growthRate(newTotal, prevNew) },
            returning: { previous: prevRet, current: retTotal, rate: growthRate(retTotal, prevRet) },
            period: { label: cmp.label, rangeText: cmp.rangeText },
        };
    }

    return shaped;
}

export default { getCatalog, isValidMetric, runInsight }
