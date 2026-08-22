import { serviceMonthlyReportPdf } from "../services/reportsService.js";
import { serviceDetailsReportPdf } from "../services/reportServiceClinicWide.js";
import { buildMonthlyReportPdfBuffer } from "../src/pdf/monthlyReportPdf.js";
import { buildMonthlyDetailsReportPdfBuffer } from "../src/pdf/monthlyDetailsReportPdf.js";
import insightsService from "../services/insightsService.js";
import insightsExcelService from "../services/insightsExcelService.js";
import reportsModel from "../models/reportsModel.js";
import asyncWrap from "../utils/asyncWrap.js";
import appError from "../utils/appError.js";

// Current year-month and any date's year-month, in clinic-local time.
const CLINIC_TZ = 'Asia/Baghdad';
function toYearMonth(date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit' })
        .format(new Date(date)).slice(0, 7);
}
function currentYearMonth() {
    return toYearMonth(new Date());
}

const downloadMonthlyPdf = asyncWrap(async (req, res) => {
    const { month, from, to } = req.query
    const { tenant_id, role } = req.user;
    let { branch_id } = req.query;

    let pdfBuffer;

    if (role === 'tenant_manager' && !branch_id) {
        const reportData = await serviceDetailsReportPdf({ month, from, to }, tenant_id);
        pdfBuffer = await buildMonthlyDetailsReportPdfBuffer(reportData);
    } else {
        if (!branch_id) {
            branch_id = req.user.branch_id;
        }
        const reportData = await serviceMonthlyReportPdf({ month, from, to }, tenant_id, branch_id);
        pdfBuffer = await buildMonthlyReportPdfBuffer(reportData);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="monthly-report.pdf"');
    res.status(200).send(pdfBuffer)
})

// ---- Insights Assistant (tenant_manager only) ----------------------------
// The assistant shows clinic-wide numbers across all branches, so it is scoped
// to the organization owner. Branch-level roles use their own dashboards.

const getInsightsCatalog = asyncWrap(async (req, res) => {
    if (req.user.role !== 'tenant_manager') {
        throw appError('FORBIDDEN', 'Insights are available to the organization manager only', 403);
    }
    res.status(200).json({ ok: true, data: insightsService.getCatalog() });
});

const getInsight = asyncWrap(async (req, res) => {
    if (req.user.role !== 'tenant_manager') {
        throw appError('FORBIDDEN', 'Insights are available to the organization manager only', 403);
    }
    const { metricId } = req.params;
    if (!insightsService.isValidMetric(metricId)) {
        throw appError('INSIGHT_NOT_FOUND', 'Unknown insight', 404);
    }
    const data = await insightsService.runInsight(metricId, req.query, req.user.tenant_id);
    res.status(200).json({ ok: true, data });
});

// Bounds for the Insights month picker: [clinic join month .. current month].
const getInsightsMeta = asyncWrap(async (req, res) => {
    if (req.user.role !== 'tenant_manager') {
        throw appError('FORBIDDEN', 'Insights are available to the organization manager only', 403);
    }
    const created = await reportsModel.getTenantCreatedAt(req.user.tenant_id);
    const latest = currentYearMonth();
    const earliest = created ? toYearMonth(created) : latest;
    res.status(200).json({ ok: true, data: { earliest_month: earliest, latest_month: latest } });
});

// Download the styled Insights Excel for ONE month. Month must be within
// [join month .. current month] — no future months, none before the clinic joined.
const downloadInsightsExcel = asyncWrap(async (req, res) => {
    if (req.user.role !== 'tenant_manager') {
        throw appError('FORBIDDEN', 'Insights are available to the organization manager only', 403);
    }
    const { month } = req.query; // 'YYYY-MM'
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        throw appError('INVALID_MONTH', 'A month (YYYY-MM) is required', 400);
    }
    const latest = currentYearMonth();
    const created = await reportsModel.getTenantCreatedAt(req.user.tenant_id);
    const earliest = created ? toYearMonth(created) : latest;
    if (month > latest) throw appError('MONTH_IN_FUTURE', 'Cannot export a future month', 400);
    if (month < earliest) throw appError('MONTH_BEFORE_JOIN', 'Cannot export a month before the clinic joined', 400);

    const { buffer, filename } = await insightsExcelService.buildInsightsWorkbook(
        { month: `${month}-01` }, req.user.tenant_id
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(Buffer.from(buffer));
});

export default { downloadMonthlyPdf, getInsightsCatalog, getInsight, getInsightsMeta, downloadInsightsExcel }