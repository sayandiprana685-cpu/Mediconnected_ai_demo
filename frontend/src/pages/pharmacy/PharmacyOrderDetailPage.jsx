import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, Card, Input, Select, Skeleton } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

const NEXT = { RECEIVED: "REVIEWING", REVIEWING: "DISPENSING" };

export default function PharmacyOrderDetailPage() {
  const { id } = useParams();
  const { data, loading, error, reload, facilityId } = useApi(`/api/pharmacy/orders/${id}`);
  const inv = useApi("/api/pharmacy/medicines");
  const toast = useToast();
  const [lines, setLines] = useState([{ inventoryId: "", quantity: "1", prescribedName: "" }]);

  async function status(next) {
    try {
      await api(`/api/pharmacy/orders/${id}/status`, { method: "PATCH", facilityId, body: { status: next } });
      toast("Order updated.");
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  async function dispense(e) {
    e.preventDefault();
    try {
      await api(`/api/pharmacy/orders/${id}/dispense`, {
        method: "POST",
        facilityId,
        body: { items: lines.filter((l) => l.inventoryId && Number(l.quantity) > 0) },
      });
      toast("Dispensed.");
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (loading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-danger">{error}</p>;
  const o = data.order;
  const rx = data.prescription;

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800" to="/app/pharmacy-orders">
          ← Orders
        </Link>
        <h1 className="mt-2 font-display text-4xl">{o.patientId?.name}</h1>
        <p className="text-ink-soft">
          {o.patientId?.mrn} · Allergies: {o.patientId?.allergies?.join(", ") || "None recorded"}
        </p>
        <Badge>{statusLabel(o.status)}</Badge>
      </div>
      <Card className="p-5">
        <h2 className="font-display text-2xl">Prescribed medicines</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(rx?.medicines || []).map((m, i) => (
            <li key={i}>
              {m.name || m.medicine} {m.strength} — {m.frequency || m.dosage}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-soft">Clinical notes and diagnoses are not shown. This view is limited to dispensing.</p>
      </Card>
      {NEXT[o.status] && (
        <Button variant="outline" onClick={() => status(NEXT[o.status])}>
          Mark {statusLabel(NEXT[o.status])}
        </Button>
      )}
      {["REVIEWING", "DISPENSING", "PARTIALLY_DISPENSED"].includes(o.status) && (
        <Card className="p-5">
          <h2 className="font-display text-2xl">Dispense</h2>
          <form className="mt-4 space-y-3" onSubmit={dispense}>
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-2">
                <Select label="Inventory item" value={l.inventoryId} onChange={(e) => setLines(lines.map((x, n) => (n === i ? { ...x, inventoryId: e.target.value } : x)))}>
                  <option value="">Select</option>
                  {(inv.data?.medicines || [])
                    .filter((m) => m.status === "ACTIVE")
                    .map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name} ({m.quantity} in stock)
                      </option>
                    ))}
                </Select>
                <Input label="Quantity" type="number" value={l.quantity} onChange={(e) => setLines(lines.map((x, n) => (n === i ? { ...x, quantity: e.target.value } : x)))} />
              </div>
            ))}
            <Button type="submit">Record dispensing</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
