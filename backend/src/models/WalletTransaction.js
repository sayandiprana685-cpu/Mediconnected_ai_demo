import mongoose from "mongoose";

export const WALLET_TRANSACTION_TYPES = [
  "TOPUP",
  "PAYMENT",
  "REFUND",
  "CASHBACK",
  "ADJUSTMENT",
  "COUPON_REDEEMED",
];

const walletTransactionSchema = new mongoose.Schema(
  {
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: "WalletAccount", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },

    // Client-generated so a phone that retries a timed-out top-up cannot
    // double-credit itself. Same idempotency idea the AI triage flow uses.
    requestId: { type: String, trim: true },

    type: { type: String, enum: WALLET_TRANSACTION_TYPES, required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    status: { type: String, enum: ["PENDING", "SUCCESS", "FAILED", "REVERSED"], default: "SUCCESS" },

    method: { type: String, trim: true, maxlength: 80 },
    // Free-form link back to whatever caused the movement: an order number,
    // an appointment id, a coupon code.
    reference: { type: String, trim: true, maxlength: 120 },
    note: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: "string" } } });

export const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);
