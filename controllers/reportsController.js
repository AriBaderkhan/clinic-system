import { serviceMonthlyReportPdf } from "../services/reportsService.js";
import { buildMonthlyReportPdfBuffer } from "../src/pdf/monthlyReportPdf.js";
import asyncWrap from "../utils/asyncWrap.js";


const controllerMonthlyReportPdf = asyncWrap(async (req, res) => {
    const { month } = req.query

    const reportData = await serviceMonthlyReportPdf({ month });

    // 2) build pdf buffer (THIS is what creates the PDF)
    const pdfBuffer = await buildMonthlyReportPdfBuffer(reportData);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="monthly-report.pdf"');
    res.status(200).send(pdfBuffer)
})

export default { controllerMonthlyReportPdf }