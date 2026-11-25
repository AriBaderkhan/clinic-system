// The clinic's clock: Iraq (Asia/Baghdad) is UTC+3 all year (no daylight saving).
// The ONE place this is written; reports, dashboards and the Excel read it from here.
export const CLINIC_TZ = 'Asia/Baghdad';
export const CLINIC_OFFSET = '+03:00';
export const CLINIC_OFFSET_HOURS = 3;

// 'YYYY-MM' of a date in the clinic's calendar
export function toYearMonth(date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit' })
        .format(new Date(date)).slice(0, 7);
}
