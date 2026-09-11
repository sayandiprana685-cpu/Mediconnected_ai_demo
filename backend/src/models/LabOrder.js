import mongoose from "mongoose";
import { LAB_ORDER_STATUS } from "../utils/constants.js";

const resultSchema = new mongoose.Schema(
  {
    name: String,
    value: String,
    unit: String,
    referenceRange: String,
    flag: { type: String, enum: ["NORMAL", "ABNORMAL", "CRITICAL", ""], default: "" },
    remarks: String,
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility" },
    note: String,
  },
  { _id: false }
);

const labOrderSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    testId: { type: mongoose.Schema.Types.ObjectId, ref: "DiagnosticTest" },
    testName: { type: String, required: true },
    testCode: String,
    category: String,
    sampleType: String,
    urgency: { type: String, enum: ["ROUTINE", "URGENT", "CRITICAL"], default: "ROUTINE" },
    status: { type: String, enum: Object.values(LAB_ORDER_STATUS), default: LAB_ORDER_STATUS.REQUESTED },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    referredFromFacilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility" },
    // Set when the patient self-books a slot from the app. Staff-created orders
    // leave it empty, which is why it is optional rather than required.
    scheduledAt: Date,
    collectionAddress: String,
    sampleCollectedAt: Date,
    processedAt: Date,
    reportReadyAt: Date,
    deliveredAt: Date,
    results: [resultSchema],
    remarks: String,
    reviewerName: String,
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reportDate: Date,
    history: [historySchema],
  },
  { timestamps: true }
);

labOrderSchema.index({ facilityId: 1, createdAt: -1 });
labOrderSchema.index({ facilityId: 1, status: 1 });
labOrderSchema.index({ patientId: 1, scheduledAt: -1 });

export const LabOrder = mongoose.model("LabOrder", labOrderSchema);
