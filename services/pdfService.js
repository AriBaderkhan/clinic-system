import { buildMonthlyReportPdfBuffer } from "../pdf/monthlyReportPdf.js";
import serviceMonthlyReportPdf from "./reportsService.js"; // whatever path/name you use

export  async function serviceMonthlyReportPdf({ month }) {
  const reportData = await serviceMonthlyReportPdf({ month });
  const pdfBuffer = await buildMonthlyReportPdfBuffer(reportData);
  return pdfBuffer;
}
