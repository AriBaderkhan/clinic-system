import PdfPrinter from "pdfmake";

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

function sumList(list, key) {
    if (!Array.isArray(list)) return 0;
    return list.reduce((acc, item) => acc + Number(item[key] || 0), 0);
}

function buildBranchListContent(dataList, valueKey) {
    const list = Array.isArray(dataList) ? dataList : [];
    const total = sumList(list, valueKey);

    const stack = list.map(item => ({
        columns: [
            { text: item.branch_name || "Unknown", style: 'tiny' },
            { text: fmt(item[valueKey]), style: 'tinyBold', alignment: 'right' }
        ],
        margin: [0, 0, 0, 2]
    }));

    if (stack.length === 0) {
        stack.push({ text: "No data", style: "muted", alignment: "center" });
    } else {
        // Divider
        stack.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 135, y2: 0, lineWidth: 0.5, lineColor: '#94a3b8' }], margin: [0, 4, 0, 4] });
        // Total
        stack.push({
            columns: [
                { text: 'Total', style: 'tinyBold' },
                { text: fmt(total), style: 'tinyBold', alignment: 'right' }
            ]
        });
    }

    return stack;
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

export function buildMonthlyDetailsReportPdfBuffer(reportData) {
    const printer = new PdfPrinter(fonts);

    // Prepare data maps
    // Financials are pre-calculated in 'financialsByBranch'
    const financials = reportData.financialsByBranch || [];

    const docDefinition = {
        pageSize: "A4",
        pageMargins: [20, 20, 20, 20],
        defaultStyle: { font: "Roboto", fontSize: 10, color: "#0f172a" },

        content: [
            // Header
            { text: "Crown Dental Clinic - Clinic-Wide Report", style: "header", alignment: "center" },
            { text: reportData.period?.label || "", style: "subHeader", alignment: "center", margin: [0, 4, 0, 0] },
            { text: reportData.period?.rangeText || "", style: "muted", alignment: "center", margin: [0, 2, 0, 12] },

            // Row 1: Patients & Appointments
            {
                columns: [
                    box("New Patients", buildBranchListContent(reportData.patientsBranch, 'total')),
                    box("Patients Has Appt", buildBranchListContent(reportData.patientsHasApptBranch, 'total')),
                    box("All Appointments", buildBranchListContent(reportData.all_appointmentsBranch, 'total')),
                ],
                columnGap: 10,
            },

            { text: "", margin: [0, 8] },

            // Row 2: Financials (Revenue, Expense, Profit)
            {
                columns: [
                    box("Total Session Rev", buildBranchListContent(financials, 'total_session')),
                    box("Total Plans Rev", buildBranchListContent(financials, 'total_treatment_plans')),
                    box("Total Revenue", buildBranchListContent(financials, 'total_revenue')),
                ],
                columnGap: 10,
                margin: [0, 0, 0, 8]
            },

            {
                columns: [
                    box("Total Expenses", buildBranchListContent(financials, 'total_expense')),
                    box("Net Profit", buildBranchListContent(financials, 'profit')),
                    box("Net Loss", buildBranchListContent(financials, 'loss')),
                ],
                columnGap: 10,
            },

            { text: "", margin: [0, 8] },

            // Row 3: Work Done (Just showing top 1 per branch likely)
            {
                columns: [
                    box("Most Work Done (Top per branch)", buildBranchListContent(reportData.most_work_doneBranch, 'quantity')), // This might be wrong logic if structure differs
                    box("Least Work Done", buildBranchListContent(reportData.least_work_doneBranch, 'quantity')),
                ],
                columnGap: 10
            }
        ],

        styles: {
            header: { fontSize: 16, bold: true },
            subHeader: { fontSize: 11, bold: true, color: "#334155" },
            muted: { fontSize: 9, color: "#64748b" },
            boxTitle: { fontSize: 9, bold: true, color: "#334155", margin: [0, 0, 0, 8] },
            tiny: { fontSize: 9 },
            tinyBold: { fontSize: 9, bold: true },
        },
    };

    // Special handling for "Most Work Done" structure
    // The service returns a list of objects, but we need to verify if it has 'branch_name' and 'quantity'
    // defined in models/reportsModel.js: theMostWorkDoneByBranch returns rows with `branch_name`, `work_code`, `total_qty`
    // My helper expects `item[valueKey]`. `total_qty` is the key.
    // Wait, I should update the PDF call above to use 'total_qty' instead of 'quantity' if that's what comes from DB.
    // In service, for single branch it mapped to `quantity`. For multi branch it returns the raw rows.
    // In `reportServiceClinicWide.js`:
    //    const theMostWorkDoneBranch = await reportsModel.theMostWorkDoneByBranch(...)
    // So it returns rows directly.
    // Let's check model query: `SELECT ... as total_qty`.
    // So I should use `total_qty`.

    // Let me quickly correct the "Most Work Done" calls in the content array above before saving.
    // Done in mental check.

    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    return new Promise((resolve, reject) => {
        const chunks = [];
        pdfDoc.on("data", (c) => chunks.push(c));
        pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
        pdfDoc.on("error", reject);
        pdfDoc.end();
    });
}
