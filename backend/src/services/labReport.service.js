import PDFDocument from "pdfkit";

function fmtDate(d) {
  if (!d) return "—";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function renderLabReportPdf(order, facility) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Laboratory Report", Author: facility?.name || "Laboratory" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const name = facility?.name || "Diagnostic centre";
    const addr = [facility?.address, facility?.city, facility?.state, facility?.pin].filter(Boolean).join(", ");
    const contact = [facility?.contactNumber, facility?.officialEmail].filter(Boolean).join("  ·  ");

    doc.font("Times-Bold").fontSize(16).text(name.toUpperCase(), { align: "center" });
    doc.font("Times-Roman").fontSize(9).text(addr, { align: "center" });
    if (contact) doc.text(contact, { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown();
    doc.font("Times-Bold").fontSize(12).text("LABORATORY REPORT", { align: "center" });
    doc.moveDown();

    const p = order.patientId || {};
    doc.font("Times-Roman").fontSize(10);
    doc.text(`Patient: ${p.name || "—"}`);
    doc.text(`Patient ID: ${p.mrn || "—"}    Age/Sex: ${p.age || "—"} / ${p.sex || "—"}`);
    doc.text(`Test: ${order.testName}${order.testCode ? ` (${order.testCode})` : ""}`);
    doc.text(`Sample: ${order.sampleType || "—"}    Test date: ${fmtDate(order.sampleCollectedAt || order.createdAt)}`);
    doc.text(`Report date: ${fmtDate(order.reportDate || order.reportReadyAt)}    Status: ${order.status}`);
    doc.moveDown();

    doc.font("Times-Bold").text("Results");
    doc.font("Times-Roman");
    const rows = order.results?.length ? order.results : [{ name: order.testName, value: "—", unit: "", referenceRange: "", flag: "" }];
    for (const r of rows) {
      doc.text(`${r.name || order.testName}: ${r.value || "—"} ${r.unit || ""}`.trim());
      if (r.referenceRange) doc.text(`  Reference range: ${r.referenceRange}`);
      if (r.flag) doc.text(`  Flag: ${r.flag}`);
      if (r.remarks) doc.text(`  Remarks: ${r.remarks}`);
    }
    if (order.remarks) {
      doc.moveDown();
      doc.font("Times-Bold").text("Remarks");
      doc.font("Times-Roman").text(order.remarks);
    }
    doc.moveDown(2);
    doc.font("Times-Bold").text(`Authorized by: ${order.reviewerName || "Laboratory professional"}`);
    doc.font("Times-Italic").fontSize(8).text("This report is issued by the named laboratory. MediConnect is the software platform only.", {
      align: "center",
    });
    doc.end();
  });
}
