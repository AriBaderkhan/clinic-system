import { buildMonthlyReportPdfBuffer } from "../pdf/monthlyReportPdf.js";
import serviceMonthlyReportPdf from "./reportsService.js"; // whatever path/name you use

export async function serviceMonthlyReportPdf({ month }, tenant_id, branch_id) {
  const reportData = await serviceMonthlyReportPdf({ month }, tenant_id, branch_id);
  const pdfBuffer = await buildMonthlyReportPdfBuffer(reportData);
  return pdfBuffer;
}
