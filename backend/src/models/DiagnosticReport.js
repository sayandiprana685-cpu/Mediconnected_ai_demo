import mongoose from "mongoose";

const diagnosticReportSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    testName: String,
    status: { type: String, enum: ["REQUESTED", "IN_PROGRESS", "READY"], default: "REQUESTED" },
    summary: String,
    resultAt: Date,
  },
  { timestamps: true }
);

export const DiagnosticReport = mongoose.model("DiagnosticReport", diagnosticReportSchema);
