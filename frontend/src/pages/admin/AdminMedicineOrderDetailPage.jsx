import { Link, useParams } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { Badge, Card, Skeleton, Timeline } from "../../components/ui/index.jsx";
import { buyerTimeline, displayOrderStatus, statusTone, timelineIndex } from "../../utils/medicineOrder.js";

export default function AdminMedicineOrderDetailPage() {
  const { id } = useParams();
  const { data, loading, error } = useApi(`/api/admin/medicine-orders/${id}`);
  if (loading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-danger">{error}</p>;
  const r = data.order;
  const steps = buyerTimeline(r.fulfillment);
  const idx = timelineIndex(r.status, steps);
  return (
    <div className="space-y-6">
      <Link className="text-sm text-teal-800" to="/app/admin-medicine-orders">
        ← Medicine orders
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-4xl">{r.requestNo}</h1>
        <Badge tone={statusTone(r.status)}>{displayOrderStatus(r.status)}</Badge>
      </div>
      <Card className="p-5 text-sm">
        <p>Shop: {r.shop?.name}</p>
        <p>Facility: {r.facility?.name}</p>
        <p>Placed by: {r.orderedBy || "—"}</p>
        <p>Date: {new Date(r.createdAt).toLocaleString()}</p>
        <p>Method: {r.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}</p>
        <p>Payment: {r.paymentStatus === "QUOTED" ? "Quoted" : "Not collected"}</p>
        {r.notes && <p>Notes: {r.notes}</p>}
        <ul className="mt-3 space-y-1">
          {(r.items || []).map((it, i) => (
            <li key={i}>
              {it.name} {it.strength} × {it.requestedQty}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <Timeline
          steps={steps.map((step, i) => ({
            title: step.title,
            done: idx >= i && idx >= 0,
            meta: "",
          }))}
        />
      </Card>
    </div>
  );
}
