import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, Card, Skeleton, Timeline } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { buyerTimeline, displayOrderStatus, isPendingOrder, statusTone, timelineIndex } from "../../utils/medicineOrder.js";

export default function MedicineOrderDetailPage() {
  const { id } = useParams();
  const { data, loading, error, reload, facilityId, errorStatus } = useApi(`/api/procurement/requests/${id}`, [], { pollMs: 8000 });
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function act(path, body, ok) {
    setBusy(true);
    try {
      const res = await api(`/api/procurement/requests/${id}${path}`, { method: "POST", facilityId, body });
      toast(res.message || ok);
      reload();
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton className="h-40" />;
  if (errorStatus === 404 || errorStatus === 403) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-red-50 p-6">
        <p className="font-semibold text-danger">{errorStatus === 403 ? "Unauthorized access" : "Order not found"}</p>
        <p className="mt-1 text-sm text-ink-soft">{error}</p>
        <Link className="mt-3 inline-block text-sm font-semibold text-teal-800" to="/app/medicine-orders">
          Back to medicine orders
        </Link>
      </div>
    );
  }
  if (error) return <p className="text-danger">{error}</p>;

  const r = data.request;
  const p = r.pharmacy || {};
  const steps = buyerTimeline(r.fulfillment);
  const idx = timelineIndex(r.status, steps);
  const timeline = steps.map((step, i) => {
    const hist = (r.history || []).find((h) => step.keys.includes(h.status));
    return {
      title: step.title,
      done: idx >= i && idx >= 0,
      meta: hist?.at ? new Date(hist.at).toLocaleString() : idx === i ? "Current" : "",
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800" to="/app/medicine-orders">
          ← Medicine orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-4xl">{r.requestNo}</h1>
          {r.urgency === "URGENT" && <Badge tone="warn">Urgent</Badge>}
          <Badge tone={statusTone(r.status)}>{displayOrderStatus(r.status)}</Badge>
        </div>
        <p className="text-ink-soft">
          {p.name} · {p.city}, {p.district} · {new Date(r.createdAt).toLocaleString()}
        </p>
      </div>

      {["REJECTED", "EXPIRED", "CANCELLED"].includes(r.status) && (
        <div className="rounded-2xl border border-line p-4 text-sm">
          {r.status === "REJECTED" && <p>This order was rejected{r.rejectionReason ? `: ${r.rejectionReason}` : "."}</p>}
          {r.status === "EXPIRED" && <p>This order expired before the pharmacy responded.</p>}
          {r.status === "CANCELLED" && <p>This order was cancelled.</p>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-display text-2xl">Medicines</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {r.items.map((it, i) => (
              <li key={i} className="border-b border-line py-2 last:border-0">
                <span className="font-semibold">{it.name}</span> {it.strength} · qty {it.requestedQty}
                {it.offeredQty != null && ` · accepted ${it.offeredQty}`}
                {it.unitPrice != null && ` · ₹${it.unitPrice}`}
              </li>
            ))}
          </ul>
          {r.notes && <p className="mt-3 text-sm">Notes: {r.notes}</p>}
          <div className="mt-4 text-sm">
            <p>Method: {r.fulfillment === "DELIVERY" ? "Delivery to facility" : "Pickup"}</p>
            <p>Payment: {r.paymentStatus === "QUOTED" ? "Quoted — not collected in this system" : "Not collected in this system"}</p>
            {r.medicinesTotal != null && <p>Medicine total: ₹{r.medicinesTotal}</p>}
            <p>Delivery charge: ₹{r.deliveryCharge || 0}</p>
            {r.grandTotal != null && <p className="font-semibold">Grand total: ₹{r.grandTotal}</p>}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-2xl">Shop</h2>
          <p className="mt-2 font-semibold">{p.name}</p>
          {p.verified && <Badge tone="ok">✓ Verified pharmacy</Badge>}
          <p className="mt-2 text-sm">
            {p.address}
            <br />
            {p.city}, {p.district} {p.pin}
          </p>
          <p className="text-sm">Hours: {p.operatingHours}</p>
          {r.fulfillment === "DELIVERY" && <p className="mt-3 text-sm font-semibold">Pharmacy will deliver to your facility.</p>}
          {r.fulfillment === "PICKUP" && (
            <p className="mt-3 text-sm font-semibold">Pickup required. Collect from the pharmacy address above.</p>
          )}
          {p.contactNumber && (
            <a className="mt-3 inline-flex min-h-11 items-center font-semibold text-teal-800" href={`tel:${p.contactNumber}`}>
              Call pharmacy
            </a>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-display text-2xl">Status</h2>
        <div className="mt-4">
          <Timeline steps={timeline} />
        </div>
      </Card>

      {isPendingOrder(r.status) || ["ACCEPTED", "PARTIALLY_AVAILABLE", "PREPARING"].includes(r.status) ? (
        <Button variant="danger" disabled={busy} onClick={() => act("/cancel", { reason: "Cancelled by facility" }, "Cancelled.")}>
          Cancel this order
        </Button>
      ) : null}
    </div>
  );
}
