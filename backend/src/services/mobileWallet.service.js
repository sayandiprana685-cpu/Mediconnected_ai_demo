import { WalletAccount, WalletTransaction } from "../models/index.js";
import { WALLET_METHOD_KINDS } from "../models/WalletAccount.js";
import { AppError } from "../utils/errors.js";

// There is no payment gateway behind this service and none is pretended to be.
// A "top-up" records money the patient says they added; a "payment" records an
// order the patient chose to settle from the balance. Nothing here contacts a
// bank. The README says so plainly, and every response carries `settled: false`
// so no screen can render a demo balance as if real money had moved.

function serializeMethod(m) {
  return {
    id: String(m._id),
    label: m.label,
    kind: m.kind,
    last4: m.last4 || "",
    expiryMonth: m.expiryMonth ?? null,
    expiryYear: m.expiryYear ?? null,
    isDefault: !!m.isDefault,
    addedAt: m.createdAt,
  };
}

function serializeCoupon(c) {
  const expired = c.expiresAt ? new Date(c.expiresAt).getTime() < Date.now() : false;
  return {
    id: String(c._id),
    code: c.code,
    description: c.description || "",
    percentOff: c.percentOff ?? null,
    flatOff: c.flatOff ?? null,
    minOrderValue: c.minOrderValue ?? 0,
    expiresAt: c.expiresAt || null,
    used: !!c.used,
    usable: !c.used && !expired,
    expired,
  };
}

function serializeTransaction(t) {
  const o = t.toObject ? t.toObject() : t;
  return {
    id: String(o._id),
    type: o.type,
    amount: o.amount,
    balanceAfter: o.balanceAfter,
    status: o.status,
    method: o.method || "",
    reference: o.reference || "",
    note: o.note || "",
    requestId: o.requestId || "",
    createdAt: o.createdAt,
  };
}

function serializeWallet(w) {
  const o = w.toObject ? w.toObject() : w;
  return {
    id: String(o._id),
    balance: Math.round((o.balance || 0) * 100) / 100,
    currency: o.currency || "INR",
    status: o.status || "ACTIVE",
    paymentMethods: (o.paymentMethods || []).map((m) => serializeMethod(m)),
    coupons: (o.coupons || []).map((c) => serializeCoupon(c)),
    settled: false,
    gatewayConnected: false,
    updatedAt: o.updatedAt,
  };
}

/** GET /api/mobile/wallet — creates the wallet on first look, so the app never has to handle a "no wallet" state. */
export async function getWallet(user, patient) {
  let wallet = await WalletAccount.findOne({ userId: user._id });
  if (!wallet) {
    wallet = await WalletAccount.create({ userId: user._id, patientId: patient?._id, balance: 0 });
    // A first-look welcome offer, so the coupons screen is not empty on day one.
    wallet.coupons.push({
      code: "WELCOME50",
      description: "₹50 off your first medicine order above ₹299.",
      flatOff: 50,
      minOrderValue: 299,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    });
    await wallet.save();
  }
  return serializeWallet(wallet);
}

async function writeEntry(wallet, { type, amount, status = "SUCCESS", method, reference, note, requestId }) {
  const signed = type === "TOPUP" || type === "REFUND" || type === "CASHBACK" ? Math.abs(amount) : -Math.abs(amount);
  wallet.balance = Math.round((wallet.balance + signed) * 100) / 100;
  await wallet.save();
  const tx = await WalletTransaction.create({
    walletId: wallet._id,
    userId: wallet.userId,
    patientId: wallet.patientId,
    requestId: requestId || undefined,
    type,
    amount: Math.round(Math.abs(amount) * 100) / 100,
    balanceAfter: wallet.balance,
    status,
    method: method || undefined,
    reference: reference || undefined,
    note: note || undefined,
  });
  return { wallet: serializeWallet(wallet), transaction: serializeTransaction(tx) };
}

/**
 * POST /api/mobile/wallet/topup — add money to the demo balance.
 * `requestId` is the idempotency key: a phone that retries after a timeout gets
 * the original transaction back instead of crediting itself twice.
 */
export async function topUpWallet(user, body) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError("Enter an amount greater than zero.", 422, "AMOUNT_INVALID");
  if (amount > 100000) throw new AppError("A single top-up is limited to 100,000.", 422, "AMOUNT_TOO_LARGE");

  const wallet = await WalletAccount.findOne({ userId: user._id });
  if (!wallet) throw new AppError("Wallet not ready yet. Open the wallet screen once.", 404, "NO_WALLET");
  if (wallet.status !== "ACTIVE") throw new AppError("This wallet is frozen.", 409, "WALLET_FROZEN");

  const requestId = String(body.requestId || "").trim();
  if (requestId) {
    const existing = await WalletTransaction.findOne({ requestId, userId: user._id });
    if (existing) return { wallet: serializeWallet(wallet), transaction: serializeTransaction(existing), idempotentReplay: true };
  }

  return writeEntry(wallet, {
    type: "TOPUP",
    amount,
    method: String(body.method || "UPI").slice(0, 80),
    requestId,
    note: String(body.note || "Balance added in the app. No payment gateway is connected.").slice(0, 300),
  });
}

/**
 * POST /api/mobile/wallet/pay — settle an order from the balance.
 * Refuses to go negative rather than allowing an overdraft the app cannot show.
 */
export async function payFromWallet(user, body) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError("Enter an amount greater than zero.", 422, "AMOUNT_INVALID");

  const wallet = await WalletAccount.findOne({ userId: user._id });
  if (!wallet) throw new AppError("Wallet not ready yet.", 404, "NO_WALLET");
  if (wallet.balance + 1e-9 < amount) {
    throw new AppError("Not enough balance for this payment.", 422, "INSUFFICIENT_BALANCE");
  }

  const requestId = String(body.requestId || "").trim();
  if (requestId) {
    const existing = await WalletTransaction.findOne({ requestId, userId: user._id });
    if (existing) return { wallet: serializeWallet(wallet), transaction: serializeTransaction(existing), idempotentReplay: true };
  }

  return writeEntry(wallet, {
    type: "PAYMENT",
    amount,
    method: "WALLET",
    reference: String(body.reference || "").slice(0, 120),
    requestId,
    note: String(body.note || "Paid from Health Wallet balance.").slice(0, 300),
  });
}

/** POST /api/mobile/wallet/refund — return money for a cancelled order. */
export async function refundToWallet(user, body) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError("Enter an amount greater than zero.", 422, "AMOUNT_INVALID");
  const wallet = await WalletAccount.findOne({ userId: user._id });
  if (!wallet) throw new AppError("Wallet not ready yet.", 404, "NO_WALLET");
  return writeEntry(wallet, {
    type: "REFUND",
    amount,
    method: "WALLET",
    reference: String(body.reference || "").slice(0, 120),
    requestId: String(body.requestId || "").trim(),
    note: String(body.note || "Refund for a cancelled order.").slice(0, 300),
  });
}

/** GET /api/mobile/wallet/transactions?type=&limit= */
export async function listTransactions(userId, { type, limit } = {}) {
  const filter = { userId };
  if (type) filter.type = String(type).toUpperCase();
  const cap = Math.min(Number(limit) || 50, 200);
  const rows = await WalletTransaction.find(filter).sort({ createdAt: -1 }).limit(cap);
  return rows.map(serializeTransaction);
}

/** POST /api/mobile/wallet/payment-methods */
export async function addPaymentMethod(userId, body) {
  const label = String(body.label || "").trim();
  if (label.length < 2) throw new AppError("Give this payment method a name.", 422, "LABEL_INVALID");
  const kind = String(body.kind || "UPI").toUpperCase();
  if (!WALLET_METHOD_KINDS.includes(kind)) {
    throw new AppError("Choose a valid payment method type.", 422, "KIND_INVALID");
  }
  const wallet = await WalletAccount.findOne({ userId });
  if (!wallet) throw new AppError("Wallet not ready yet.", 404, "NO_WALLET");

  const last4 = String(body.last4 || "").replace(/\D/g, "").slice(-4);
  if (kind === "CARD" && last4.length !== 4) {
    throw new AppError("Enter the last 4 digits of the card.", 422, "LAST4_REQUIRED");
  }
  if (wallet.paymentMethods.length >= 8) {
    throw new AppError("You can save up to 8 payment methods. Remove one first.", 422, "TOO_MANY_METHODS");
  }

  // Only one default. Deciding this once keeps a checkout from having to guess
  // which method to pre-select.
  const hasDefault = wallet.paymentMethods.some((m) => m.isDefault);
  const makeDefault = !!body.isDefault || !hasDefault;
  if (makeDefault) {
    wallet.paymentMethods.forEach((m) => {
      m.isDefault = false;
    });
  }
  wallet.paymentMethods.push({
    label: label.slice(0, 80),
    kind,
    last4: last4 || undefined,
    expiryMonth: body.expiryMonth ? Number(body.expiryMonth) : undefined,
    expiryYear: body.expiryYear ? Number(body.expiryYear) : undefined,
    isDefault: makeDefault,
  });
  await wallet.save();
  return serializeWallet(wallet);
}

/** DELETE /api/mobile/wallet/payment-methods/:methodId */
export async function removePaymentMethod(userId, methodId) {
  const wallet = await WalletAccount.findOne({ userId });
  if (!wallet) throw new AppError("Wallet not ready yet.", 404, "NO_WALLET");
  const before = wallet.paymentMethods.length;
  wallet.paymentMethods = wallet.paymentMethods.filter((m) => String(m._id) !== String(methodId));
  if (wallet.paymentMethods.length === before) throw new AppError("That payment method was not found.", 404, "NOT_FOUND");
  if (!wallet.paymentMethods.some((m) => m.isDefault) && wallet.paymentMethods.length) {
    wallet.paymentMethods[0].isDefault = true;
  }
  await wallet.save();
  return serializeWallet(wallet);
}

/**
 * POST /api/mobile/wallet/coupons/apply — price a coupon against an order
 * total WITHOUT consuming it. The order route consumes it on placement, so
 * abandoning a checkout does not burn the patient's offer.
 */
export async function priceCoupon(userId, { code, orderTotal }) {
  const wallet = await WalletAccount.findOne({ userId });
  if (!wallet) throw new AppError("Wallet not ready yet.", 404, "NO_WALLET");
  const c = wallet.coupons.find((x) => x.code === String(code || "").trim().toUpperCase());
  if (!c) throw new AppError("That coupon code is not valid for you.", 404, "COUPON_NOT_FOUND");
  if (c.used) throw new AppError("That coupon has already been used.", 409, "COUPON_USED");
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) {
    throw new AppError("That coupon has expired.", 409, "COUPON_EXPIRED");
  }
  const total = Number(orderTotal);
  if (!Number.isFinite(total) || total < 0) throw new AppError("Enter a valid order total.", 422, "TOTAL_INVALID");
  if (total < (c.minOrderValue || 0)) {
    throw new AppError(`This coupon needs an order of at least ${c.minOrderValue}.`, 422, "MIN_ORDER_NOT_MET");
  }
  const off = c.percentOff ? (total * c.percentOff) / 100 : c.flatOff || 0;
  const discount = Math.round(Math.min(off, total) * 100) / 100;
  return { coupon: serializeCoupon(c), orderTotal: total, discount, payable: Math.round((total - discount) * 100) / 100 };
}

export { serializeWallet, serializeTransaction };
