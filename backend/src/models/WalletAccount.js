import mongoose from "mongoose";

// One wallet per app account. There is NO payment gateway behind this: a top-up
// records an intention and a balance, it never moves real money. Every route
// that touches it says so, so nobody can mistake a demo balance for a settled
// payment.

export const WALLET_METHOD_KINDS = ["UPI", "CARD", "NETBANKING", "CASH", "WALLET"];

const paymentMethodSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    kind: { type: String, enum: WALLET_METHOD_KINDS, default: "UPI" },
    // Stored as display fragments only. Never a full card number or UPI secret.
    last4: { type: String, trim: true, maxlength: 4 },
    expiryMonth: Number,
    expiryYear: Number,
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: true }
);

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    description: { type: String, trim: true, maxlength: 200 },
    percentOff: { type: Number, min: 0, max: 100 },
    flatOff: { type: Number, min: 0 },
    minOrderValue: { type: Number, min: 0, default: 0 },
    expiresAt: Date,
    used: { type: Boolean, default: false },
  },
  { _id: true }
);

const walletAccountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", index: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["ACTIVE", "FROZEN"], default: "ACTIVE" },
    paymentMethods: [paymentMethodSchema],
    coupons: [couponSchema],
  },
  { timestamps: true }
);

export const WalletAccount = mongoose.model("WalletAccount", walletAccountSchema);
