import ExcelJS from 'exceljs';
import reportsModel from '../models/reportsModel.js';
import insightsExcelModel from '../models/insightsExcelModel.js';
import resolveReportDateRange from '../utils/reportsDateRange.js';

/**
 * INSIGHTS EXCEL EXPORT
 * One styled workbook, four topic sheets: Revenue, Works, Patients, Appointments.
 * Read-only. Money is kept per currency_code (IQD and USD never summed together).
 * Built for on-screen / video use: brand colours, borders, ranked tables.
 */

const THEME = {
  teal: 'FF0E6E75', band: 'FFEAF3F4', white: 'FFFFFFFF',
  ink: 'FF1F2937', sub: 'FF6B7280', line: 'FFD9E2E4', gold: 'FFB7791F',
};

// Clinic week: Saturday first, Friday last (matches the region).
const WEEKDAYS = [
  { dow: 6, name: 'Saturday' }, { dow: 0, name: 'Sunday' }, { dow: 1, name: 'Monday' },
  { dow: 2, name: 'Tuesday' }, { dow: 3, name: 'Wednesday' }, { dow: 4, name: 'Thursday' },
  { dow: 5, name: 'Friday' },
];

const num = (v) => Number(v || 0);
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const prettyType = (t) => ({ normal: 'Normal', urgent: 'Urgent', walk_in: 'Walk-in' }[t] || t);

// ---- styling helpers ------------------------------------------------------
const F_MONEY = { numFmt: '#,##0', align: 'right' };
const F_COUNT = { numFmt: '#,##0', align: 'center' };
const F_PCT = { numFmt: '0.0"%"', align: 'center' };
const F_TEXT = { align: 'left' };

function box() {
  const s = { style: 'thin', color: { argb: THEME.line } };
  return { top: s, left: s, bottom: s, right: s };
}

function titleBlock(ws, span, clinic, subtitle) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = clinic;
  t.font = { bold: true, size: 18, color: { argb: THEME.teal } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, span);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { size: 11, italic: true, color: { argb: THEME.sub } };
  ws.getRow(2).height = 18;
  return 4; // next content row (row 3 stays blank)
}

function sectionHeader(ws, r, span, text) {
  ws.mergeCells(r, 1, r, span);
  const c = ws.getCell(r, 1);
  c.value = text;
  c.font = { bold: true, size: 12, color: { argb: THEME.white } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.teal } };
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(r).height = 22;
  return r + 1;
}

function tableHeader(ws, r, headers) {
  const row = ws.getRow(r);
  headers.forEach((h, i) => {
    const c = row.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: THEME.ink }, size: 11 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.band } };
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
    c.border = box();
  });
  row.height = 19;
  return r + 1;
}

function dataRows(ws, start, rows, formats) {
  rows.forEach((r, ri) => {
    const row = ws.getRow(start + ri);
    r.forEach((val, ci) => {
      const c = row.getCell(ci + 1);
      c.value = val;
      const f = formats[ci] || {};
      if (f.numFmt) c.numFmt = f.numFmt;
      c.alignment = { vertical: 'middle', horizontal: f.align || (ci === 0 ? 'left' : 'center') };
      c.border = box();
      c.font = { color: { argb: THEME.ink }, size: 11 };
      if (ri % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.band } };
    });
    row.height = 18;
  });
  return start + rows.length + 2; // blank spacer row after
}

function kpi(ws, r, span, label, value) {
  ws.mergeCells(r, 1, r, span);
  const c = ws.getCell(r, 1);
  c.value = { richText: [
    { text: `${label}:  `, font: { color: { argb: THEME.sub }, size: 11 } },
    { text: String(value), font: { bold: true, color: { argb: THEME.teal }, size: 12 } },
  ] };
  ws.getRow(r).height = 18;
  return r + 1;
}

// ---- main -----------------------------------------------------------------

async function buildInsightsWorkbook({ month, from, to }, tenant_id) {
  const period = await resolveReportDateRange({ month, from, to });
  const f = period.from, t = period.to;

  const [
    clinicName, revByCur, revDoctor, works, collectedPlan, byWeekday, byType, statusRows, busiest,
    newRows, retRows, ageRows, refRows,
  ] = await Promise.all([
    reportsModel.getTenantName(tenant_id),
    insightsExcelModel.revenueByCurrency(f, t, tenant_id),
    insightsExcelModel.revenuePerDoctor(f, t, tenant_id),
    insightsExcelModel.worksRanked(f, t, tenant_id),
    insightsExcelModel.collectedByPlanType(f, t, tenant_id),
    insightsExcelModel.apptsByWeekday(f, t, tenant_id),
    insightsExcelModel.apptsByType(f, t, tenant_id),
    insightsExcelModel.apptStatusCounts(f, t, tenant_id),
    insightsExcelModel.busiestDate(f, t, tenant_id),
    reportsModel.registeredPatientByBranch(f, t, tenant_id),
    reportsModel.returningPatientsByBranch(f, t, tenant_id),
    reportsModel.patientsByAgeBucketByBranch(f, t, tenant_id),
    reportsModel.referralBreakdownByBranch(f, t, tenant_id),
  ]);

  const clinic = clinicName?.name || clinicName || 'Clinic';
  const periodLabel = period.label || period.rangeText || '';
  const wb = new ExcelJS.Workbook();
  wb.creator = clinic;

  // aggregate a [{label,total}] (possibly per branch) into one map by label
  const aggByLabel = (rows) => {
    const m = new Map();
    for (const r of rows) m.set(r.label, (m.get(r.label) || 0) + num(r.total));
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };

  // ===================== SHEET 1: REVENUE =====================
  {
    const ws = wb.addWorksheet('Revenue', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }];
    let r = titleBlock(ws, 4, clinic, `Revenue  ·  ${periodLabel}`);

    const curs = new Set([...revByCur.sessions.map((x) => x.currency_code), ...revByCur.plans.map((x) => x.currency_code)]);
    const totalRows = [...curs].map((cur) => {
      const s = num(revByCur.sessions.find((x) => x.currency_code === cur)?.total);
      const p = num(revByCur.plans.find((x) => x.currency_code === cur)?.total);
      return [cur, s, p, s + p];
    });
    r = sectionHeader(ws, r, 4, 'Total revenue (per currency)');
    r = tableHeader(ws, r, ['Currency', 'From visits', 'From plans', 'Total']);
    r = dataRows(ws, r, totalRows.length ? totalRows : [['—', 0, 0, 0]], [F_TEXT, F_MONEY, F_MONEY, F_MONEY]);

    r = sectionHeader(ws, r, 4, 'Revenue per doctor');
    r = tableHeader(ws, r, ['Doctor', 'Currency', 'Revenue', '']);
    const docRows = revDoctor.map((d) => [d.doctor, d.currency_code, num(d.total), '']);
    r = dataRows(ws, r, docRows.length ? docRows : [['—', '—', 0, '']], [F_TEXT, { align: 'center' }, F_MONEY, {}]);
  }

  // ===================== SHEET 2: WORKS =====================
  {
    const ws = wb.addWorksheet('Works', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 6 }, { width: 30 }, { width: 14 }, { width: 18 }, { width: 12 }];
    let r = titleBlock(ws, 5, clinic, `Works — most done & revenue  ·  ${periodLabel}`);
    r = sectionHeader(ws, r, 5, 'All works (top → lowest)');
    r = tableHeader(ws, r, ['#', 'Work', 'Times done', 'Revenue', 'Currency']);

    // Plan works show money actually COLLECTED (by plan type + currency); normal
    // works show their billed value (they're paid at the visit).
    const collectedMap = new Map();
    for (const c of collectedPlan) collectedMap.set(`${c.plan_type}|${c.currency_code}`, num(c.collected));
    const rows = works.map((w, i) => {
      const revenue = w.is_plan
        ? (collectedMap.get(`${w.code}|${w.currency_code}`) || 0)
        : num(w.billed);
      return [i + 1, w.work, num(w.times_done), revenue, w.currency_code];
    });
    r = dataRows(ws, r, rows.length ? rows : [[1, '—', 0, 0, '—']], [F_COUNT, F_TEXT, F_COUNT, F_MONEY, { align: 'center' }]);
    const note = ws.getCell(r, 1);
    note.value = 'Plan works (implant, ortho, RCT…) show money actually collected; other works show billed value.';
    note.font = { italic: true, size: 10, color: { argb: THEME.sub } };
    ws.mergeCells(r, 1, r, 5);
  }

  // ===================== SHEET 3: PATIENTS =====================
  {
    const ws = wb.addWorksheet('Patients', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 26 }, { width: 14 }, { width: 14 }];
    let r = titleBlock(ws, 3, clinic, `Patients  ·  ${periodLabel}`);

    const newP = newRows.reduce((a, x) => a + num(x.total), 0);
    const retP = retRows.reduce((a, x) => a + num(x.total), 0);
    const totP = newP + retP;
    r = kpi(ws, r, 3, 'Total (new + returning) this period', totP);
    r += 1;

    r = sectionHeader(ws, r, 3, 'New vs returning');
    r = tableHeader(ws, r, ['Type', 'Count', '%']);
    r = dataRows(ws, r, [['New', newP, pct(newP, totP)], ['Returning', retP, pct(retP, totP)]], [F_TEXT, F_COUNT, F_PCT]);

    const age = aggByLabel(ageRows);
    const ageTot = age.reduce((a, x) => a + x.value, 0);
    r = sectionHeader(ws, r, 3, 'By age group');
    r = tableHeader(ws, r, ['Age', 'Count', '%']);
    r = dataRows(ws, r, age.length ? age.map((x) => [x.label, x.value, pct(x.value, ageTot)]) : [['—', 0, 0]], [F_TEXT, F_COUNT, F_PCT]);

    const ref = aggByLabel(refRows);
    const refTot = ref.reduce((a, x) => a + x.value, 0);
    r = sectionHeader(ws, r, 3, 'Referral source');
    r = tableHeader(ws, r, ['Source', 'Count', '%']);
    dataRows(ws, r, ref.length ? ref.map((x) => [x.label, x.value, pct(x.value, refTot)]) : [['—', 0, 0]], [F_TEXT, F_COUNT, F_PCT]);
  }

  // ===================== SHEET 4: APPOINTMENTS =====================
  {
    const ws = wb.addWorksheet('Appointments', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 6 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 14 }];
    let r = titleBlock(ws, 5, clinic, `Appointments  ·  ${periodLabel}`);

    const statusOf = (s) => num(statusRows.find((x) => x.status === s)?.count);
    const totalAppts = statusRows.reduce((a, x) => a + num(x.count), 0);
    const cancelled = statusOf('cancelled');
    const noShow = statusOf('no_show');
    const completed = statusOf('completed');
    r = kpi(ws, r, 5, 'Total appointments', totalAppts);
    r = kpi(ws, r, 5, 'Completed', completed);
    r = kpi(ws, r, 5, 'Cancelled + No-show', `${cancelled + noShow}  (${pct(cancelled + noShow, totalAppts)}%)`);
    if (busiest) r = kpi(ws, r, 5, 'Busiest day', `${new Date(busiest.date).toISOString().slice(0, 10)}  (${num(busiest.appts)} appointments)`);
    r += 1;

    // By weekday, ranked most → least productive
    const wdMap = new Map(byWeekday.map((x) => [x.dow, x]));
    let wd = WEEKDAYS.map((w) => ({
      name: w.name,
      appts: num(wdMap.get(w.dow)?.appts),
      patients: num(wdMap.get(w.dow)?.patients),
    })).filter((w) => w.appts > 0 || w.patients > 0);
    const patTot = wd.reduce((a, w) => a + w.patients, 0);
    wd.sort((a, b) => b.appts - a.appts);
    r = sectionHeader(ws, r, 5, 'By weekday (most → least productive)');
    r = tableHeader(ws, r, ['#', 'Weekday', 'Appointments', 'Patients', '% patients']);
    r = dataRows(ws, r, wd.length ? wd.map((w, i) => [i + 1, w.name, w.appts, w.patients, pct(w.patients, patTot)]) : [[1, '—', 0, 0, 0]],
      [F_COUNT, F_TEXT, F_COUNT, F_COUNT, F_PCT]);

    // By type
    const typeTot = byType.reduce((a, x) => a + num(x.count), 0);
    r = sectionHeader(ws, r, 5, 'By type');
    r = tableHeader(ws, r, ['Type', 'Count', '%', '', '']);
    dataRows(ws, r, byType.length ? byType.map((x) => [prettyType(x.type), num(x.count), pct(num(x.count), typeTot), '', '']) : [['—', 0, 0, '', '']],
      [F_TEXT, F_COUNT, F_PCT, {}, {}]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const safe = String(clinic).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  const filename = `Insights_${safe || 'Clinic'}_${(periodLabel || 'report').replace(/[^a-z0-9]+/gi, '_')}.xlsx`;
  return { buffer, filename };
}

export default { buildInsightsWorkbook };
