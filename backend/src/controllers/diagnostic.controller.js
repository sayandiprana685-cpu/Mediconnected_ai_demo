import {
  DiagnosticTest,
  Facility,
  LabOrder,
  Patient,
} from "../models/index.js";
import {
  FACILITY_STATUS,
  LAB_ORDER_STATUS,
  LAB_ORDER_TRANSITIONS,
} from "../utils/constants.js";
import { AppError, asyncHandler } from "../utils/errors.js";
import { writeAudit } from "../services/audit.service.js";
import { todayRange } from "../utils/time.js";
import { renderLabReportPdf } from "../services/labReport.service.js";

function assertVerified(facility) {
  if (facility.status !== FACILITY_STATUS.VERIFIED) {
    throw new AppError("This provider is not verified yet.", 403, "NOT_VERIFIED");
  }
}

function scoped(req) {
  return { facilityId: req.facilityId };
}

export const diagnosticController = {
  listTests: asyncHandler(async (req, res) => {
    const filter = scoped(req);
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) filter.name = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const tests = await DiagnosticTest.find(filter).sort({ name: 1 });
    res.json({ tests });
  }),

  createTest: asyncHandler(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    if (name.length < 2) throw new AppError("Enter a test name.", 422, "NAME_INVALID");
    const test = await DiagnosticTest.create({
      facilityId: req.facilityId,
      name,
      code: String(b.code || "").trim(),
      category: String(b.category || "GENERAL").trim(),
      sampleType: String(b.sampleType || "").trim(),
      preparation: String(b.preparation || "").trim(),
      turnaroundMinutes: b.turnaroundMinutes != null ? Number(b.turnaroundMinutes) : undefined,
      homeCollection: !!b.homeCollection,
      available: b.available !== false,
      price: b.price != null && b.price !== "" ? Number(b.price) : undefined,
      referenceRange: String(b.referenceRange || "").trim(),
      units: String(b.units || "").trim(),
      status: b.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    });
    await writeAudit(req, { action: "TEST_CREATE", resource: "DiagnosticTest", resourceId: test._id, facilityId: req.facilityId });
    res.status(201).json({ test, message: "Test added." });
  }),

  updateTest: asyncHandler(async (req, res) => {
    const test = await DiagnosticTest.findOne({ _id: req.params.id, facilityId: req.facilityId });
    if (!test) throw new AppError("Test not found.", 404, "NOT_FOUND");
    const b = req.body || {};
    const fields = [
      "name",
      "code",
      "category",
      "sampleType",
      "preparation",
      "turnaroundMinutes",
      "homeCollection",
      "available",
      "price",
      "referenceRange",
      "units",
      "status",
    ];
    for (const k of fields) if (b[k] !== undefined) test[k] = b[k];
    if (test.name) test.name = String(test.name).trim();
    await test.save();
    await writeAudit(req, { action: "TEST_UPDATE", resource: "DiagnosticTest", resourceId: test._id, facilityId: req.facilityId });
    res.json({ test, message: "Test updated." });
  }),

  listOrders: asyncHandler(async (req, res) => {
    const filter = scoped(req);
    if (req.query.status) filter.status = req.query.status;
    const orders = await LabOrder.find(filter)
      .populate("patientId", "name mrn age sex phone")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ orders });
  }),

  createOrder: asyncHandler(async (req, res) => {
    assertVerified(req.facility || (await Facility.findById(req.facilityId)));
    const b = req.body || {};
    const patient = await Patient.findById(b.patientId);
    if (!patient) throw new AppError("Patient not found.", 404, "NOT_FOUND");
    const homeOk = patient.homeFacilityId && String(patient.homeFacilityId) === String(req.facilityId);
    const prior = await LabOrder.exists({ patientId: patient._id, facilityId: req.facilityId });
    if (!homeOk && !prior) {
      throw new AppError("This patient is not in your laboratory workflow. Register them at this centre first.", 403, "FORBIDDEN");
    }
    let test = null;
    if (b.testId) {
      test = await DiagnosticTest.findOne({ _id: b.testId, facilityId: req.facilityId });
      if (!test) throw new AppError("Test not found at this facility.", 404, "NOT_FOUND");
    }
    const testName = test?.name || String(b.testName || "").trim();
    if (!testName) throw new AppError("Select or enter a test.", 422, "TEST_REQUIRED");
    const order = await LabOrder.create({
      facilityId: req.facilityId,
      patientId: patient._id,
      testId: test?._id,
      testName,
      testCode: test?.code || b.testCode,
      category: test?.category || b.category,
      sampleType: test?.sampleType || b.sampleType,
      urgency: ["URGENT", "CRITICAL"].includes(b.urgency) ? b.urgency : "ROUTINE",
      status: LAB_ORDER_STATUS.REQUESTED,
      requestedBy: req.user._id,
      referredFromFacilityId: b.referredFromFacilityId,
      history: [{ status: LAB_ORDER_STATUS.REQUESTED, at: new Date(), actorId: req.user._id, facilityId: req.facilityId }],
    });
    await writeAudit(req, { action: "LAB_ORDER_CREATE", resource: "LabOrder", resourceId: order._id, facilityId: req.facilityId });
    res.status(201).json({ order, message: "Test order created." });
  }),

  orderOne: asyncHandler(async (req, res) => {
    const order = await LabOrder.findOne({ _id: req.params.id, facilityId: req.facilityId })
      .populate("patientId", "name mrn age sex phone")
      .populate("requestedBy", "name")
      .populate("reviewerId", "name");
    if (!order) throw new AppError("Order not found.", 404, "NOT_FOUND");
    res.json({ order });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const order = await LabOrder.findOne({ _id: req.params.id, facilityId: req.facilityId });
    if (!order) throw new AppError("Order not found.", 404, "NOT_FOUND");
    const next = req.body.status;
    const allowed = LAB_ORDER_TRANSITIONS[order.status] || [];
    if (!allowed.includes(next)) {
      throw new AppError(`Cannot move from ${order.status} to ${next}.`, 422, "INVALID_TRANSITION");
    }
    order.status = next;
    const now = new Date();
    if (next === LAB_ORDER_STATUS.SAMPLE_COLLECTED) order.sampleCollectedAt = now;
    if (next === LAB_ORDER_STATUS.PROCESSING) order.processedAt = now;
    if (next === LAB_ORDER_STATUS.REPORT_READY) {
      order.reportReadyAt = now;
      order.reportDate = now;
      order.reviewerId = req.user._id;
      order.reviewerName = req.user.name;
    }
    if (next === LAB_ORDER_STATUS.DELIVERED) order.deliveredAt = now;
    order.history.push({ status: next, at: now, actorId: req.user._id, facilityId: req.facilityId, note: req.body.note });
    await order.save();
    await writeAudit(req, {
      action: "LAB_ORDER_STATUS",
      resource: "LabOrder",
      resourceId: order._id,
      facilityId: req.facilityId,
      metadata: { status: next },
    });
    res.json({ order, message: "Order updated." });
  }),

  saveResults: asyncHandler(async (req, res) => {
    const order = await LabOrder.findOne({ _id: req.params.id, facilityId: req.facilityId });
    if (!order) throw new AppError("Order not found.", 404, "NOT_FOUND");
    if (![LAB_ORDER_STATUS.PROCESSING, LAB_ORDER_STATUS.SAMPLE_COLLECTED, LAB_ORDER_STATUS.REPORT_READY].includes(order.status)) {
      throw new AppError("Results can only be entered while the sample is collected or processing.", 422, "INVALID_STATUS");
    }
    const results = Array.isArray(req.body.results) ? req.body.results : [];
    order.results = results.map((r) => ({
      name: r.name || order.testName,
      value: r.value,
      unit: r.unit || "",
      referenceRange: r.referenceRange || "",
      flag: ["NORMAL", "ABNORMAL", "CRITICAL"].includes(r.flag) ? r.flag : "",
      remarks: r.remarks || "",
    }));
    order.remarks = req.body.remarks != null ? String(req.body.remarks) : order.remarks;
    await order.save();
    await writeAudit(req, { action: "TEST_RESULT", resource: "LabOrder", resourceId: order._id, facilityId: req.facilityId });
    res.json({ order, message: "Results saved." });
  }),

  reportPdf: asyncHandler(async (req, res) => {
    const order = await LabOrder.findOne({ _id: req.params.id, facilityId: req.facilityId }).populate(
      "patientId",
      "name mrn age sex"
    );
    if (!order) throw new AppError("Order not found.", 404, "NOT_FOUND");
    if (![LAB_ORDER_STATUS.REPORT_READY, LAB_ORDER_STATUS.DELIVERED].includes(order.status)) {
      throw new AppError("The report is not ready yet.", 422, "NOT_READY");
    }
    const facility = req.facility || (await Facility.findById(req.facilityId));
    const buf = await renderLabReportPdf(order, facility);
    await writeAudit(req, { action: "REPORT_FINALIZE", resource: "LabOrder", resourceId: order._id, facilityId: req.facilityId });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="lab-report-${order._id}.pdf"`);
    res.send(buf);
  }),

  dashboard: asyncHandler(async (req, res) => {
    const facilityId = req.facilityId;
    const todayQ = { facilityId, createdAt: todayRange() };
    const [
      todayOrders,
      pending,
      samplePending,
      collected,
      processing,
      reportsPending,
      reportsCompleted,
      critical,
    ] = await Promise.all([
      LabOrder.countDocuments(todayQ),
      LabOrder.countDocuments({ facilityId, status: { $in: [LAB_ORDER_STATUS.REQUESTED, LAB_ORDER_STATUS.ACCEPTED] } }),
      LabOrder.countDocuments({ facilityId, status: LAB_ORDER_STATUS.SAMPLE_PENDING }),
      LabOrder.countDocuments({ facilityId, status: LAB_ORDER_STATUS.SAMPLE_COLLECTED }),
      LabOrder.countDocuments({ facilityId, status: LAB_ORDER_STATUS.PROCESSING }),
      LabOrder.countDocuments({
        facilityId,
        status: { $in: [LAB_ORDER_STATUS.PROCESSING, LAB_ORDER_STATUS.SAMPLE_COLLECTED] },
      }),
      LabOrder.countDocuments({
        facilityId,
        status: { $in: [LAB_ORDER_STATUS.REPORT_READY, LAB_ORDER_STATUS.DELIVERED] },
      }),
      LabOrder.countDocuments({ facilityId, urgency: { $in: ["URGENT", "CRITICAL"] }, status: { $nin: [LAB_ORDER_STATUS.DELIVERED, LAB_ORDER_STATUS.REJECTED] } }),
    ]);
    const facility = await Facility.findById(facilityId).select("name type status");
    const recent = await LabOrder.find({ facilityId }).populate("patientId", "name mrn").sort({ createdAt: -1 }).limit(8);
    res.json({
      facility,
      kpis: {
        todayOrders,
        pendingOrders: pending,
        samplesPending: samplePending,
        samplesCollected: collected,
        inProgress: processing,
        reportsPending,
        reportsCompleted,
        criticalReports: critical,
      },
      recent,
    });
  }),
};
