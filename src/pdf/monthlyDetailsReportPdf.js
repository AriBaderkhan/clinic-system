import PdfPrinter from "pdfmake";
import { fmtMoney } from "./money.js";

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

// Plain grouped number (no currency code) — the table has a dedicated Currency
// column, so amount cells stay compact.
const money = (n) => fmtMoney(n, null);

function sumList(list, key) {
    if (!Array.isArray(list)) return 0;
    return list.reduce((acc, item) => acc + Number(item[key] || 0), 0);
}

// Count list (patients / appointments): [{ branch_name, total }] → stacked lines
// with a plain integer total. (These are counts, never money, so no currency.)
function buildCountListContent(dataList, valueKey) {
    const list = Array.isArray(dataList) ? dataList : [];
    const total = sumList(list, valueKey);

    const stack = list.map((item) => ({
        columns: [
            { text: item.branch_name || "Unknown", style: "tiny" },
            { text: `${safeNum(item[valueKey])}`, style: "tinyBold", alignment: "right" },
        ],
        margin: [0, 0, 0, 2],
    }));

    if (stack.length === 0) {
        stack.push({ text: "No data", style: "muted", alignment: "center" });
    } else {
        stack.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: 135, y2: 0, lineWidth: 0.5, lineColor: "#94a3b8" }], margin: [0, 4, 0, 4] });
        stack.push({ columns: [{ text: "Total", style: "tinyBold" }, { text: `${total}`, style: "tinyBold", alignment: "right" }] });
    }
    return stack;
}

// Top/least work per branch: [{ branch_name, work_code, total_qty }] → list.
function buildWorkListContent(dataList) {
    const list = Array.isArray(dataList) ? dataList : [];
    if (list.length === 0) return [{ text: "No data", style: "muted", alignment: "center" }];
    return list.map((w) => ({
        columns: [
            { text: w.branch_name || "Unknown", style: "tiny" },
            { text: `${w.work_code || "-"} (${safeNum(w.total_qty)})`, style: "tinyBold", alignment: "right" },
        ],
        margin: [0, 0, 0, 2],
    }));
}

function box(title, contentStack, opts = {}) {
    return {
        margin: [0, 0, 0, 0],
        table: { widths: ["*"], body: [[{ stack: [{ text: title, style: "boxTitle" }, ...contentStack], margin: [10, 10, 10, 10] }]] },
        layout: {
            hLineColor: () => "#e5e7eb", vLineColor: () => "#e5e7eb",
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        ...opts,
    };
}

// Financial table: one row per branch+currency, then grand totals per currency.
function financialsTable(financialsByBranch, grandTotals) {
    const rows = Array.isArray(financialsByBranch) ? financialsByBranch : [];
    const totals = Array.isArray(grandTotals) ? grandTotals : [];

    const head = ["Branch", "Cur", "Sessions", "Plans", "Revenue", "Expense", "Profit", "Loss"]
        .map((h) => ({ text: h, style: "th" }));

    const body = [head];

    if (rows.length === 0) {
        body.push([{ text: "No transactions in this period", colSpan: 8, style: "muted", alignment: "center" }, {}, {}, {}, {}, {}, {}, {}]);
    } else {
        rows.forEach((f) => {
            body.push([
                { text: f.branch_name || "Unknown", style: "td" },
                { text: f.currency_code, style: "td" },
                { text: money(f.total_session), style: "tdNum" },
                { text: money(f.total_treatment_plans), style: "tdNum" },
                { text: money(f.total_revenue), style: "tdNum" },
                { text: money(f.total_expense), style: "tdNum" },
                { text: money(f.profit), style: "tdNum" },
                { text: money(f.loss), style: "tdNum" },
            ]);
        });
        totals.forEach((g) => {
            body.push([
                { text: "TOTAL", style: "tdTotal" },
                { text: g.currency_code, style: "tdTotal" },
                { text: money(g.total_session), style: "tdTotalNum" },
                { text: money(g.total_treatment_plans), style: "tdTotalNum" },
                { text: money(g.total_revenue), style: "tdTotalNum" },
                { text: money(g.total_expense), style: "tdTotalNum" },
                { text: money(g.profit), style: "tdTotalNum" },
                { text: money(g.loss), style: "tdTotalNum" },
            ]);
        });
    }

    return {
        table: { headerRows: 1, widths: ["*", "auto", "auto", "auto", "auto", "auto", "auto", "auto"], body },
        layout: {
            hLineColor: () => "#e5e7eb", vLineColor: () => "#e5e7eb",
            hLineWidth: () => 0.5, vLineWidth: () => 0.5,
            paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3,
        },
    };
}

export function buildMonthlyDetailsReportPdfBuffer(reportData) {
    const printer = new PdfPrinter(fonts);
    const clinicName = reportData.clinic_name || "Clinic";

    const docDefinition = {
        pageSize: "A4",
        pageMargins: [20, 20, 20, 20],
        defaultStyle: { font: "Roboto", fontSize: 10, color: "#0f172a" },

        content: [
            // Header — uses the tenant's real name
            { text: `${clinicName} — Clinic-Wide Report`, style: "header", alignment: "center" },
            { text: reportData.period?.label || "", style: "subHeader", alignment: "center", margin: [0, 4, 0, 0] },
            { text: reportData.period?.rangeText || "", style: "muted", alignment: "center", margin: [0, 2, 0, 12] },

            // Row 1: Patients & Appointments (counts)
            {
                columns: [
                    box("New Patients", buildCountListContent(reportData.patientsBranch, 'total')),
                    box("Patients Has Appt", buildCountListContent(reportData.patientsHasApptBranch, 'total')),
                    box("All Appointments", buildCountListContent(reportData.all_appointmentsBranch, 'total')),
                ],
                columnGap: 10,
            },

            { text: "", margin: [0, 8] },

            // Row 2: Financials — per branch + currency, with per-currency totals
            box("Financials (per branch & currency)", [
                financialsTable(reportData.financialsByBranch, reportData.grandTotals),
            ]),

            { text: "", margin: [0, 8] },

            // Row 3: Work done (top / least per branch)
            {
                columns: [
                    box("Most Work Done (per branch)", buildWorkListContent(reportData.most_work_doneBranch)),
                    box("Least Work Done (per branch)", buildWorkListContent(reportData.least_work_doneBranch)),
                ],
                columnGap: 10,
            },
        ],

        styles: {
            header: { fontSize: 16, bold: true },
            subHeader: { fontSize: 11, bold: true, color: "#334155" },
            muted: { fontSize: 9, color: "#64748b" },
            boxTitle: { fontSize: 9, bold: true, color: "#334155", margin: [0, 0, 0, 8] },
            tiny: { fontSize: 9 },
            tinyBold: { fontSize: 9, bold: true },
            th: { fontSize: 8, bold: true, color: "#334155" },
            td: { fontSize: 8 },
            tdNum: { fontSize: 8, alignment: "right" },
            tdTotal: { fontSize: 8, bold: true },
            tdTotalNum: { fontSize: 8, bold: true, alignment: "right" },
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
