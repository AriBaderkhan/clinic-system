
function addMonths(date, months) {
    const d = new Date(date);
    d.setUTCMonth(d.getUTCMonth() + months);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function formatMonthLabel(date) {
    return date.toLocaleString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });
}
export default async function resolveReportDateRange({ month, from, to }) {
    // 1. Custom Range Handling
    if (from && to) {
        const fromDate = new Date(from);
        const toDate = new Date(to);

        // Logic: "to" date usually implies "until end of that day".
        // DB queries use "< to". So if user says "Feb 5", we want "< Feb 6".
        const queryTo = new Date(toDate);
        queryTo.setUTCDate(queryTo.getUTCDate() + 1);
        return {
            from: fromDate,
            to: queryTo,
            label: `Custom: ${formatDate(fromDate)} - ${formatDate(toDate)}`,
            rangeText: `${formatDate(fromDate)} → ${formatDate(toDate)}`
        };
    }
    // 2. Existing Month Handling (Fall back to this if no from/to)
    if (month) {
        const input = new Date(`${month}T00:00:00Z`);
        const inputMonth = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), 1));

        const now = new Date();
        const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        if (inputMonth > currentMonth) throw new Error("Future month not allowed");
        const nextMonth = addMonths(inputMonth, 1);

        // If current month, cap 'to' at 'now'
        const effectiveTo = (inputMonth.getTime() === currentMonth.getTime()) ? now : nextMonth;

        return {
            from: inputMonth,
            to: effectiveTo,
            label: formatMonthLabel(inputMonth),
            rangeText: `${formatDate(inputMonth)} → ${formatDate(effectiveTo)}`
        };
    }
    throw new Error("Invalid Date Selection");
}