// utils/dateRange.js

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * getDateRange("today" | "yesterday" | "last_week" | "last_month")
 * returns { from: Date, to: Date } or null if no filter/invalid
 */
function getDateRange(dayFilter) {
  if (!dayFilter) return null;

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  switch (dayFilter) {
    case "today": {
      return { from: todayStart, to: tomorrowStart };
    }

    case "yesterday": {
      const yesterdayStart = addDays(todayStart, -1);
      return { from: yesterdayStart, to: todayStart };
    }

    case "last_week": {
      // last 7 days including today
      const sevenDaysAgo = addDays(todayStart, -7);
      return { from: sevenDaysAgo, to: tomorrowStart };
    }

    case "last_month": {
      // last 30 days including today
      const thirtyDaysAgo = addDays(todayStart, -30);
      return { from: thirtyDaysAgo, to: tomorrowStart };
    }

    default:
      return null; // invalid value -> no date filter
  }
}

export default { getDateRange }


