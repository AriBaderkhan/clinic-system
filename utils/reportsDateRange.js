// Report periods must line up with the clinic's LOCAL calendar, not UTC.
// created_at is stored as TIMESTAMPTZ; if we cut the month at UTC midnight the
// window is shifted by the clinic's offset (e.g. Iraq = +3h), so transactions in
// the first/last few hours of a day land in the wrong month's report.
//
// The app is Iraq-based (Asia/Baghdad, a fixed +03:00 with no DST — matches the
// timezone hard-coded across reminders/dashboards). If multi-timezone clinics
// are added later, thread the tenant's timezone in here.
const CLINIC_TZ = 'Asia/Baghdad';
const CLINIC_OFFSET = '+03:00';

const pad = (n) => String(n).padStart(2, '0');

function formatMonthLabel(date) {
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: CLINIC_TZ });
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: CLINIC_TZ });
}

export default async function resolveReportDateRange({ month, from, to }) {
    // 1. Custom range — parse the date-only strings at clinic-local midnight.
    if (from && to) {
        const fromDate = new Date(`${from}T00:00:00${CLINIC_OFFSET}`);
        const toStart = new Date(`${to}T00:00:00${CLINIC_OFFSET}`);
        // "to" is inclusive of that whole day → query is "< next day".
        const queryTo = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
        if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toStart.getTime())) {
            throw new Error('Invalid Date Selection');
        }
        return {
            from: fromDate,
            to: queryTo,
            label: `Custom: ${formatDate(fromDate)} - ${formatDate(toStart)}`,
            rangeText: `${formatDate(fromDate)} → ${formatDate(toStart)}`,
        };
    }

    // 2. Month — first-of-month .. first-of-next-month, both at clinic midnight.
    if (month) {
        const [y, m] = String(month).split('-').map(Number); // month = 'YYYY-MM-01'
        if (!y || !m) throw new Error('Invalid Date Selection');

        const from = new Date(`${y}-${pad(m)}-01T00:00:00${CLINIC_OFFSET}`);
        const ny = m === 12 ? y + 1 : y;
        const nm = m === 12 ? 1 : m + 1;
        const nextMonth = new Date(`${ny}-${pad(nm)}-01T00:00:00${CLINIC_OFFSET}`);

        const now = new Date();
        if (from > now) throw new Error('Future month not allowed');

        // Current month → cap 'to' at now; past month → full month.
        const effectiveTo = now < nextMonth ? now : nextMonth;

        return {
            from,
            to: effectiveTo,
            label: formatMonthLabel(from),
            rangeText: `${formatDate(from)} → ${formatDate(effectiveTo)}`,
        };
    }

    throw new Error('Invalid Date Selection');
}
