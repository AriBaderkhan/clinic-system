import PdfPrinter from "pdfmake";

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

function fmt(n) {
  return new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeNum(n));
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

  const sessions = safeNum(reportData.revenue?.sessions);
  const tp = safeNum(reportData.revenue?.treatment_plans);
  const totalRevenue = safeNum(reportData.revenue?.total);

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
      // Header (center)
      { text: "Crown Dental Clinic Doctor Report", style: "header", alignment: "center" },
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
          box("Revenue", [
            { columns: [{ text: "Sessions", style: "muted" }, { text: fmt(sessions), alignment: "right", style: "tinyBold" }], margin: [0, 0, 0, 4] },
            { columns: [{ text: "Treatment Plans", style: "muted" }, { text: fmt(tp), alignment: "right", style: "tinyBold" }], margin: [0, 0, 0, 6] },
            { canvas: [{ type: "line", x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 1, lineColor: "#e5e7eb" }] },
            { columns: [{ text: "Total", style: "tinyBold" }, { text: fmt(totalRevenue), alignment: "right", style: "tinyBold" }], margin: [0, 6, 0, 0] },
          ]),
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
