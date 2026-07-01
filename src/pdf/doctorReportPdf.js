import PdfPrinter from "pdfmake";
import { fmtMoney } from "./money.js";

// Same built-in-font setup as the general monthly report so the look matches.
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

function box(title, contentStack, opts = {}) {
  return {
    margin: [0, 0, 0, 0],
    table: {
      widths: ["*"],
      body: [
        [
          {
            stack: [{ text: title, style: "boxTitle" }, ...contentStack],
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

export function buildDoctorReportPdfBuffer(reportData) {
  const printer = new PdfPrinter(fonts);

  // Revenue is a list, one entry per currency (never mixed).
  const revList = Array.isArray(reportData.revenue) ? reportData.revenue : [];
  const revenueContent = revList.length
    ? revList.flatMap((r) => {
        const c = r.currency_code;
        return [
          { columns: [{ text: `Sessions (${c})`, style: "muted" }, { text: fmtMoney(r.sessions, c), alignment: "right", style: "tinyBold" }], margin: [0, 0, 0, 4] },
          { columns: [{ text: `Treatment Plans (${c})`, style: "muted" }, { text: fmtMoney(r.treatment_plans, c), alignment: "right", style: "tinyBold" }], margin: [0, 0, 0, 6] },
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 1, lineColor: "#e5e7eb" }] },
          { columns: [{ text: `Total (${c})`, style: "tinyBold" }, { text: fmtMoney(r.total, c), alignment: "right", style: "tinyBold" }], margin: [0, 6, 0, 10] },
        ];
      })
    : [{ text: "No revenue in this period", style: "muted" }];

  const completed = safeNum(reportData.appointments?.completed);
  const scheduled = safeNum(reportData.appointments?.scheduled);
  const totalAppts = safeNum(reportData.appointments?.total);

  const works = Array.isArray(reportData.works) ? reportData.works : [];
  const workRows = works.length
    ? works.map((w) => ({
        columns: [
          { text: w.name || w.code || "—", style: "tinyBold" },
          { text: `${safeNum(w.quantity)}`, style: "tinyBold", alignment: "right" },
        ],
        margin: [0, 0, 0, 4],
      }))
    : [{ text: "No works in this period", style: "muted" }];

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [24, 20, 24, 20],
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#0f172a" },

    content: [
      // Header (center) — uses the tenant's real name
      { text: `${reportData.clinic_name || "Clinic"} — Doctor Report`, style: "header", alignment: "center" },
      {
        text: [
          reportData.doctor_name ? `Dr. ${reportData.doctor_name}` : "",
          reportData.branch_name ? `  ·  ${reportData.branch_name}` : "",
        ].join(""),
        style: "subHeader",
        alignment: "center",
        margin: [0, 4, 0, 0],
      },
      { text: reportData.period?.label || "", style: "subHeader", alignment: "center", margin: [0, 4, 0, 0] },
      { text: reportData.period?.rangeText || "", style: "muted", alignment: "center", margin: [0, 2, 0, 12] },

      // Row 1: Appointments (completed / scheduled / total)
      box("Appointments", [
        {
          columns: [
            box("Completed", [{ text: `${completed}`, style: "mid" }], { margin: [0, 0, 6, 0] }),
            box("Scheduled", [{ text: `${scheduled}`, style: "mid" }], { margin: [0, 0, 6, 0] }),
            box("Total", [{ text: `${totalAppts}`, style: "mid" }]),
          ],
          columnGap: 0,
        },
      ]),

      { text: "", margin: [0, 8] },

      // Row 2: Revenue + Works done
      {
        columns: [
          box("Revenue", revenueContent),
          box("Works Done", [{ text: `${safeNum(reportData.works_count)}`, style: "big" }]),
        ],
        columnGap: 10,
      },

      { text: "", margin: [0, 8] },

      // Row 3: Treatments / works list
      box("Treatments / Works", workRows),
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
