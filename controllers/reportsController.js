import { serviceMonthlyReportPdf } from "../services/reportsService.js";
import { serviceDetailsReportPdf } from "../services/reportServiceClinicWide.js";
import { buildMonthlyReportPdfBuffer } from "../src/pdf/monthlyReportPdf.js";
import { buildMonthlyDetailsReportPdfBuffer } from "../src/pdf/monthlyDetailsReportPdf.js";
import insightsService from "../services/insightsService.js";
import asyncWrap from "../utils/asyncWrap.js";
import appError from "../utils/appError.js";

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

export default { downloadMonthlyPdf, getInsightsCatalog, getInsight }