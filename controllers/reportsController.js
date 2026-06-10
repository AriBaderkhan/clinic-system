import { serviceMonthlyReportPdf } from "../services/reportsService.js";
import { serviceDetailsReportPdf } from "../services/reportServiceClinicWide.js";
import { buildMonthlyReportPdfBuffer } from "../src/pdf/monthlyReportPdf.js";
import { buildMonthlyDetailsReportPdfBuffer } from "../src/pdf/monthlyDetailsReportPdf.js";
import asyncWrap from "../utils/asyncWrap.js";

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

export default { downloadMonthlyPdf }