import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, Card, Input, Select, Skeleton } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { displayOrderStatus, isPendingOrder, shopNextAction, statusTone } from "../../utils/medicineOrder.js";

export default function PharmacyRequestDetailPage() {
  const { id } = useParams();
  const { data, loading, error, reload, facilityId, errorStatus } = useApi(`/api/pharmacy/procurement/${id}`, [], { pollMs: 8000 });
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [fulfillment, setFulfillment] = useState("PICKUP");
  const [deliveryCharge, setDeliveryCharge] = useState("0");
  const [reason, setReason] = useState("");
  const [authOk, setAuthOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data?.request) return;
    setItems(
      data.request.items.map((it) => ({
        name: it.name,
        strength: it.strength,
        requestedQty: it.requestedQty,
        offeredQty: it.offeredQty != null ? it.offeredQty : it.requestedQty,
        unitPrice: it.unitPrice ?? "",
        prescriptionRequired: it.prescriptionRequired,
      }))
    );
    if (data.request.fulfillment) setFulfillment(data.request.fulfillment);
    if (data.request.deliveryCharge != null) setDeliveryCharge(String(data.request.deliveryCharge));
  }, [data]);

  async function respond(decision) {
    setBusy(true);
    try {
      const res = await api(`/api/pharmacy/procurement/${id}/respond`, {
        method: "POST",
        facilityId,
        body: {
          decision,
          fulfillment,
          deliveryCharge: Number(deliveryCharge) || 0,
          authorizationAcknowledged: authOk || !items.some((it) => it.prescriptionRequired),
          reason,
          items,
        },
      });
      toast(res.message);
      reload();
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      setBusy(false);
    }
  }

  async function advance(status) {
    setBusy(true);
    try {
      await api(`/api/pharmacy/procurement/${id}/status`, { method: "PATCH", facilityId, body: { status } });
      toast("Status updated.");
      reload();
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton className="h-40" />;
  if (errorStatus === 403 || errorStatus === 404) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-red-50 p-6">
        <p className="font-semibold text-danger">{errorStatus === 403 ? "Unauthorized access" : "Order not found"}</p>
        <p className="mt-1 text-sm text-ink-soft">{error}</p>
      </div>
    );
  }
  if (error) return <p className="text-danger">{error}</p>;

  const r = data.request;
  const f = r.fromFacility || {};
  const pending = isPendingOrder(r.status);
  const next = shopNextAction(r.status, r.fulfillment);
  const needsRx = items.some((it) => it.prescriptionRequired);

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800" to="/app/pharmacy-requests">
          ← Medicine orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-4xl">{r.requestNo}</h1>
          {r.urgency === "URGENT" && <Badge tone="warn">Urgent</Badge>}
          <Badge tone={statusTone(r.status)}>{displayOrderStatus(r.status)}</Badge>
        </div>
        <p className="text-ink-soft">
          {f.name} · {f.city}, {f.district} · {new Date(r.createdAt).toLocaleString()}
          {r.orderedBy ? ` · Placed by ${r.orderedBy}` : ""}
        </p>
      </div>

      <Card className="p-5">
        <h2 className="font-display text-2xl">Ordering facility</h2>
        <p className="mt-2 text-sm">
          {f.address}, {f.city}, {f.pin}
        </p>
        <p className="text-sm">Delivery / pickup: {r.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}</p>
        <p className="text-sm">Payment: {r.paymentStatus === "QUOTED" ? "Quoted (not collected here)" : "Not collected in this system"}</p>
        {r.notes && <p className="mt-2 text-sm">Notes: {r.notes}</p>}
        {f.contactNumber && (
          <a className="mt-2 inline-flex min-h-11 items-center font-semibold text-teal-800" href={`tel:${f.contactNumber}`}>
            Contact facility
          </a>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-2xl">Medicines</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="py-2">Medicine</th>
                <th>Requested</th>
                <th>Available (current)</th>
                <th>Offer qty</th>
                <th>Unit price (optional)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const avail = data.availability?.find((a) => a.name === it.name && a.strength === it.strength);
                return (
                  <tr key={i} className="border-t border-line">
                    <td className="py-2">
                      {it.name} {it.strength}
                      {it.prescriptionRequired && <div className="text-xs text-ink-soft">Prescription / authorization required</div>}
                    </td>
                    <td>{it.requestedQty}</td>
                    <td>
                      {avail?.availableQty ?? "—"}
                      {avail && avail.availableQty < it.requestedQty ? (
                        <div className="text-xs text-danger">
                          Requested: {it.requestedQty} · Available: {avail.availableQty}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {pending ? (
                        <input
                          type="number"
                          min={0}
                          className="h-9 w-20 rounded-lg border border-line px-2"
                          value={it.offeredQty}
                          onChange={(e) => setItems((prev) => prev.map((x, idx) => (idx === i ? { ...x, offeredQty: Number(e.target.value) } : x)))}
                        />
                      ) : (
                        r.items[i]?.offeredQty ?? "—"
                      )}
                    </td>
                    <td>
                      {pending ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-9 w-24 rounded-lg border border-line px-2"
                          value={it.unitPrice}
                          onChange={(e) => setItems((prev) => prev.map((x, idx) => (idx === i ? { ...x, unitPrice: e.target.value } : x)))}
                        />
                      ) : (
                        r.items[i]?.unitPrice ?? "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {pending && (
        <Card className="p-5 space-y-3">
          <h2 className="font-display text-2xl">Respond</h2>
          <Select label="Fulfillment" value={fulfillment} onChange={(e) => setFulfillment(e.target.value)}>
            <option value="PICKUP">Pickup only</option>
            <option value="DELIVERY">Delivery available</option>
          </Select>
          <Input label="Delivery charge" type="number" min="0" value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} />
          {needsRx && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={authOk} onChange={(e) => setAuthOk(e.target.checked)} />
              I will verify prescription / authorization for restricted items before supply.
            </label>
          )}
          <Input label="Rejection reason (if rejecting)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => respond("ACCEPT")}>
              Accept order
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => respond("PARTIAL")}>
              Partially accept
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => respond("REJECT")}>
              Reject order
            </Button>
          </div>
        </Card>
      )}

      {next && (
        <Button disabled={busy} onClick={() => advance(next.status)}>
          {next.label}
        </Button>
      )}
    </div>
  );
}
