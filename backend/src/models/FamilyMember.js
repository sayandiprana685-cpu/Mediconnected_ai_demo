import mongoose from "mongoose";

// A family member the account holder can book for. Deliberately NOT a User and
// NOT a Patient: giving every child or parent a full login would multiply the
// accounts a rural household has to remember. These are contact-and-clinical
// details held under one verified phone number.

export const FAMILY_RELATIONS = [
  "SELF",
  "SPOUSE",
  "CHILD",
  "PARENT",
  "SIBLING",
  "GRANDPARENT",
  "OTHER",
];

const familyMemberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // The Patient document of the account holder who owns this entry.
    ownerPatientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", index: true },

    name: { type: String, required: true, trim: true, maxlength: 120 },
    relation: { type: String, enum: FAMILY_RELATIONS, default: "OTHER" },
    sex: { type: String, enum: ["Female", "Male", "Other"] },
    dateOfBirth: Date,
    age: Number,
    bloodGroup: { type: String, trim: true, maxlength: 5 },
    allergies: [String],
    conditions: [String],
    phone: { type: String, trim: true, maxlength: 20 },
    address: { type: String, trim: true, maxlength: 300 },

    // Set once this person has their own verified phone login. From that point
    // their records live on their own Patient document and this entry just
    // links to it, so nothing is duplicated.
    linkedPatientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },

    isDefault: { type: Boolean, default: false },
    // Avatar accent colour name, resolved against the app theme. No photo
    // upload here: the app draws an initials avatar instead.
    avatarTone: { type: String, trim: true, maxlength: 20 },
  },
  { timestamps: true }
);

familyMemberSchema.index({ userId: 1, name: 1 });

export const FamilyMember = mongoose.model("FamilyMember", familyMemberSchema);
