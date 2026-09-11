export function displayOrderStatus(s) {
  const map = {
    PENDING: "Pending",
    REQUESTED: "Pending",
    PHARMACY_REVIEWING: "Pending",
    ACCEPTED: "Accepted",
    PARTIALLY_AVAILABLE: "Accepted (partial)",
    ORDER_CONFIRMED: "Accepted",
    PREPARING: "Preparing",
    READY: "Ready",
    READY_FOR_PICKUP: "Ready for pickup",
    OUT_FOR_DELIVERY: "Out for delivery",
    DELIVERED: "Delivered",
    COLLECTED: "Completed",
    COMPLETED: "Completed",
    REJECTED: "Rejected",
    CANCELLED: "Cancelled",
    EXPIRED: "Expired",
  };
  return map[s] || String(s || "").replaceAll("_", " ");
}

export function statusTone(status) {
  if (["REJECTED", "EXPIRED", "CANCELLED"].includes(status)) return "danger";
  if (["COMPLETED", "DELIVERED", "COLLECTED", "ACCEPTED", "READY"].includes(status)) return "ok";
  if (["PARTIALLY_AVAILABLE", "PREPARING", "OUT_FOR_DELIVERY"].includes(status)) return "warn";
  return "neutral";
}

export function isPendingOrder(status) {
  return ["PENDING", "REQUESTED", "PHARMACY_REVIEWING"].includes(status);
}

export function shopNextAction(status, fulfillment) {
  if (["ACCEPTED", "PARTIALLY_AVAILABLE", "ORDER_CONFIRMED"].includes(status)) {
    return { status: "PREPARING", label: "Start preparing" };
  }
  if (status === "PREPARING") return { status: "READY", label: "Mark ready" };
  if (status === "READY" && fulfillment === "DELIVERY") return { status: "OUT_FOR_DELIVERY", label: "Out for delivery" };
  if (status === "READY") return { status: "COMPLETED", label: "Completed" };
  if (status === "READY_FOR_PICKUP") return { status: "COMPLETED", label: "Completed" };
  if (status === "OUT_FOR_DELIVERY") return { status: "DELIVERED", label: "Mark delivered" };
  if (["DELIVERED", "COLLECTED"].includes(status)) return { status: "COMPLETED", label: "Completed" };
  return null;
}

export function buyerTimeline(fulfillment) {
  if (fulfillment === "DELIVERY") {
    return [
      { keys: ["PENDING", "REQUESTED", "PHARMACY_REVIEWING"], title: "Order placed" },
      { keys: ["ACCEPTED", "PARTIALLY_AVAILABLE", "ORDER_CONFIRMED"], title: "Accepted" },
      { keys: ["PREPARING"], title: "Preparing" },
      { keys: ["READY", "READY_FOR_PICKUP"], title: "Ready" },
      { keys: ["OUT_FOR_DELIVERY"], title: "Out for delivery" },
      { keys: ["DELIVERED", "COLLECTED", "COMPLETED"], title: "Delivered" },
    ];
  }
  return [
    { keys: ["PENDING", "REQUESTED", "PHARMACY_REVIEWING"], title: "Order placed" },
    { keys: ["ACCEPTED", "PARTIALLY_AVAILABLE", "ORDER_CONFIRMED"], title: "Accepted" },
    { keys: ["PREPARING"], title: "Preparing" },
    { keys: ["READY", "READY_FOR_PICKUP"], title: "Ready for pickup" },
    { keys: ["COLLECTED", "COMPLETED", "DELIVERED"], title: "Completed" },
  ];
}

export function timelineIndex(status, steps) {
  if (["REJECTED", "EXPIRED", "CANCELLED"].includes(status)) return -1;
  const hit = steps.findIndex((s) => s.keys.includes(status));
  return hit >= 0 ? hit : 0;
}

export function canOrderLines(lines) {
  if (!lines?.length) return false;
  return lines.every((l) => l.status === "AVAILABLE" && (l.availableQty == null || l.availableQty >= (l.requestedQty || 0)));
}
