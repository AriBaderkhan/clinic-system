import { serviceMonthlyReportPdf } from "../services/reportsService.js";
import { serviceDetailsReportPdf } from "../services/reportServiceClinicWide.js";
import { buildMonthlyReportPdfBuffer } from "../src/pdf/monthlyReportPdf.js";
import { buildMonthlyDetailsReportPdfBuffer } from "../src/pdf/monthlyDetailsReportPdf.js";
import asyncWrap from "../utils/asyncWrap.js";


const controllerMonthlyReportPdf = asyncWrap(async (req, res) => {
    const { month, from, to } = req.query
    const { tenant_id, role } = req.user;
    let { branch_id } = req.query; // Get branch_id from query if provided

    let pdfBuffer;

    // Check for Clinic-Wide Report (Tenant Manager requesting report without explicit branch_id)
    // We ignore req.user.branch_id here to allow "Global View" by default for managers
    if (role === 'tenant_manager' && !branch_id) {
        const reportData = await serviceDetailsReportPdf({ month, from, to }, tenant_id);
        pdfBuffer = await buildMonthlyDetailsReportPdfBuffer(reportData);
    } else {
        // Normal Single Branch Report fallback 
        // If no explicit branch in query, use the user's current active branch
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

export default { controllerMonthlyReportPdf }