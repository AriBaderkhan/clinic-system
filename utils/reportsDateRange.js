
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
export default async function monthlyReporteDateRange(month) {

    const input = new Date(`${month}T00:00:00Z`);
    const inputMonth = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), 1));

    const now = new Date();
    const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    if (inputMonth.getTime() < currentMonth.getTime()) {
        const from = inputMonth;
        const to = addMonths(inputMonth, 1);

        const displayEnd = new Date(to);
        displayEnd.setUTCDate(displayEnd.getUTCDate() - 1);

        return {
            from,
            to,
            label: formatMonthLabel(from),
            rangeText: `${formatDate(from)} → ${formatDate(displayEnd)}`
        };
    }

    if (inputMonth.getTime() === currentMonth.getTime()) {
        const from = inputMonth;
        const to = now;

        return {
            from,
            to,
            label: formatMonthLabel(from),
            rangeText: `${formatDate(from)} → ${formatDate(now)}`
        };
    }
    throw new Error("Future month is not allowed");
}