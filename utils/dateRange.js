// utils/dateRange.js
//
// Day ranges ("today" | "yesterday" | "last_week" | "last_month") are computed
// in the CLINIC's timezone, NOT the server's. On a UTC-hosted server (production)
// "today" would otherwise land on a different calendar day than the clinic's
// (e.g. after midnight in Baghdad but still "yesterday" in UTC), which hid
// today's appointments. Pass the branch/tenant timezone so production == local.

// Offset (ms) between `timeZone`'s wall clock and UTC, at the given instant.
function tzOffsetMs(timeZone, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== "literal") map[p.type] = p.value;
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
  return asUTC - date.getTime();
}

// UTC instant of local midnight (start of day) in `timeZone`, `days` away from now.
function zonedStartOfDay(timeZone, base, days = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);
  const map = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const utcMidnight = new Date(Date.UTC(+map.year, +map.month - 1, +map.day + days, 0, 0, 0));
  return new Date(utcMidnight.getTime() - tzOffsetMs(timeZone, utcMidnight));
}

/**
 * getDateRange("today" | "yesterday" | "last_week" | "last_month", timeZone)
 * Returns { from: Date, to: Date } (UTC instants) computed in `timeZone`,
 * or null for no/invalid filter. Falls back to UTC if no timezone is given.
 */
function getDateRange(dayFilter, timeZone = "UTC") {
  if (!dayFilter) return null;
  const tz = timeZone || "UTC";
  const base = new Date();

  const todayStart = zonedStartOfDay(tz, base, 0);
  const tomorrowStart = zonedStartOfDay(tz, base, 1);

  switch (dayFilter) {
    case "today":
      return { from: todayStart, to: tomorrowStart };
    case "yesterday":
      return { from: zonedStartOfDay(tz, base, -1), to: todayStart };
    case "last_week":
      return { from: zonedStartOfDay(tz, base, -7), to: tomorrowStart };
    case "last_month":
      return { from: zonedStartOfDay(tz, base, -30), to: tomorrowStart };
    default:
      return null;
  }
}

export default { getDateRange };
