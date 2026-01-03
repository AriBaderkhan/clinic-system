import PdfPrinter from "pdfmake";

/**
 * Minimal, production-safe fonts (NO font folder needed).
 * We map Roboto -> built-in PDFKit fonts.
 */
const fonts = {
  Roboto: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n) {
  return new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeNum(n));
}

function pickStatus(apptsDoneByStatus = [], key) {
  const row = apptsDoneByStatus.find((r) => r.status === key);
  return safeNum(row?.status_total);
}

function box(title, contentStack, opts = {}) {
  return {
    margin: [0, 0, 0, 0],
    table: {
      widths: ["*"],
      body: [
        [
          {
            stack: [
              { text: title, style: "boxTitle" },
              ...contentStack,
            ],
            margin: [10, 10, 10, 10],
          },
        ],
      ],
    },
    layout: {
      hLineColor: () => "#e5e7eb",
      vLineColor: () => "#e5e7eb",
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    ...opts,
  };
}

export function buildMonthlyReportPdfBuffer(reportData) {
  const printer = new PdfPrinter(fonts);

  const stCompleted = pickStatus(reportData.apptsDoneByStatus, "completed");
  const stNoShow = pickStatus(reportData.apptsDoneByStatus, "no_show");
  const stCancelled = pickStatus(reportData.apptsDoneByStatus, "cancelled");

  const docAppts = (reportData.apptForEachDoctor || []).map((d) => ({
    columns: [
      { text: d.doctor_name || "Unknown", style: "tinyBold" },
      { text: `${safeNum(d.total_appointments)}`, style: "tinyBold", alignment: "right" },
    ],
    margin: [0, 0, 0, 4],
  }));

  const mostName = reportData.most_work_done?.name ?? "N/A";
  const mostQty = safeNum(reportData.most_work_done?.quantity);
  const leastName = reportData.least_work_done?.name ?? "N/A";
  const leastQty = safeNum(reportData.least_work_done?.quantity);

  // Revenue box: sessions + treatment + total (your request)
  const sessionRevenue = safeNum(reportData.total_session);
  const tpRevenue = safeNum(reportData.total_treatment_plans_amount);
  const totalRevenue = safeNum(reportData.revenue);

  const expenses = safeNum(reportData.expense);
  const profit = safeNum(reportData.profit);
  const loss = safeNum(reportData.loss);

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [24, 20, 24, 20],
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#0f172a" },

    content: [
      // Header (center)
      { text: "Crown Dental Clinic Report Monthly", style: "header", alignment: "center" },
      { text: reportData.period?.label || "", style: "subHeader", alignment: "center", margin: [0, 4, 0, 0] },
      { text: reportData.period?.rangeText || "", style: "muted", alignment: "center", margin: [0, 2, 0, 12] },

      // Row 1 (2 boxes)
      {
        columns: [
          box("New Patients", [{ text: `${safeNum(reportData.patients)}`, style: "big" }]),
          box("Patients Has Appointment", [{ text: `${safeNum(reportData.patientsHasAppt)}`, style: "big" }]),
        ],
        columnGap: 10,
      },

      { text: "", margin: [0, 8] },

      // Row 2 (All appointments + Status box)
      {
        columns: [
          box("All Appointments", [{ text: `${safeNum(reportData.all_appointments)}`, style: "big" }]),
          box("Appointments by Status", [
            {
              columns: [
                box("Completed", [{ text: `${stCompleted}`, style: "mid" }], { margin: [0, 0, 6, 0] }),
                box("No Show", [{ text: `${stNoShow}`, style: "mid" }], { margin: [0, 0, 6, 0] }),
                box("Cancelled", [{ text: `${stCancelled}`, style: "mid" }]),
              ],
              columnGap: 0,
            },
          ]),
        ],
        columnGap: 10,
      },

      { text: "", margin: [0, 8] },

      // Row 3 (Doctors)
      box("Appointments for Each Doctor", docAppts.length ? docAppts : [{ text: "No data", style: "muted" }]),

      { text: "", margin: [0, 8] },

      // Row 4 (Revenue / Expense / Profit / Loss)
      {
        columns: [
          box("Revenue", [
            { columns: [{ text: "Sessions", style: "muted" }, { text: fmt(sessionRevenue), alignment: "right", style: "tinyBold" }], margin: [0, 0, 0, 4] },
            { columns: [{ text: "Treatment Plans", style: "muted" }, { text: fmt(tpRevenue), alignment: "right", style: "tinyBold" }], margin: [0, 0, 0, 6] },
            { canvas: [{ type: "line", x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 1, lineColor: "#e5e7eb" }] },
            { columns: [{ text: "Total", style: "tinyBold" }, { text: fmt(totalRevenue), alignment: "right", style: "tinyBold" }], margin: [0, 6, 0, 0] },
          ]),
          box("Expense", [{ text: fmt(expenses), style: "mid" }]),
          box("Profit", [{ text: fmt(profit), style: "mid" }]),
          box("Loss", [{ text: fmt(loss), style: "mid" }]),
        ],
        columnGap: 10,
      },

      { text: "", margin: [0, 8] },

      // Row 5 (Most / Least)
      {
        columns: [
          box("Most Work Done", [
            { text: mostName, style: "tinyBold" },
            { text: `Qty: ${mostQty}`, style: "muted", margin: [0, 4, 0, 0] },
          ]),
          box("Least Work Done", [
            { text: leastName, style: "tinyBold" },
            { text: `Qty: ${leastQty}`, style: "muted", margin: [0, 4, 0, 0] },
          ]),
        ],
        columnGap: 10,
      },
    ],

    styles: {
      header: { fontSize: 16, bold: true },
      subHeader: { fontSize: 11, bold: true, color: "#334155" },
      muted: { fontSize: 9, color: "#64748b" },
      boxTitle: { fontSize: 9, bold: true, color: "#334155", margin: [0, 0, 0, 8] },
      big: { fontSize: 22, bold: true },
      mid: { fontSize: 16, bold: true },
      tinyBold: { fontSize: 10, bold: true },
    },
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);

  return new Promise((resolve, reject) => {
    const chunks = [];
    pdfDoc.on("data", (c) => chunks.push(c));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
}
