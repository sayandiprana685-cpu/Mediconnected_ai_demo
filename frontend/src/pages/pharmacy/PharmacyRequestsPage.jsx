import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { Badge, EmptyState, Table } from "../../components/ui/index.jsx";
import { displayOrderStatus, statusTone } from "../../utils/medicineOrder.js";

const BUCKETS = [
  ["INCOMING", "Incoming"],
  ["ACTIVE", "Active"],
  ["COMPLETED", "Completed"],
  ["REJECTED", "Rejected / cancelled"],
];

export default function PharmacyRequestsPage() {
  const [bucket, setBucket] = useState("INCOMING");
  const { data, error } = useApi(`/api/pharmacy/procurement?bucket=${bucket}`, [bucket], { pollMs: 8000 });
  if (error) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-red-50 p-6">
        <p className="text-danger">Unable to load medicine orders.</p>
        <p className="mt-1 text-sm text-ink-soft">{error}</p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="font-display text-4xl">Medicine orders</h1>
      <p className="text-ink-soft">Facility orders sent to this shop only. Prescription dispensing remains under Prescriptions.</p>
      <div className="my-4 flex flex-wrap gap-2">
        {BUCKETS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setBucket(id)}
            className={`min-h-9 rounded-full px-3 text-sm ${bucket === id ? "bg-teal-900 text-white" : "border border-line bg-paper-2"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Table
        columns={[
          {
            key: "id",
            label: "Order ID",
            render: (r) => (
              <Link className="font-semibold text-teal-800" to={`/app/pharmacy-requests/${r._id}`}>
                {r.requestNo}
              </Link>
            ),
          },
          { key: "f", label: "Facility", render: (r) => r.fromFacility?.name },
          { key: "m", label: "Medicines", render: (r) => r.items?.map((i) => `${i.name} ×${i.requestedQty}`).join(", ") },
          { key: "d", label: "Date", render: (r) => new Date(r.createdAt).toLocaleString() },
          { key: "mthd", label: "Method", render: (r) => (r.fulfillment === "DELIVERY" ? "Delivery" : "Pickup") },
          { key: "pay", label: "Payment", render: (r) => (r.paymentStatus === "QUOTED" ? "Quoted" : "Not collected") },
          {
            key: "s",
            label: "Status",
            render: (r) => (
              <span className="inline-flex items-center gap-2">
                {r.urgency === "URGENT" && <Badge tone="warn">Urgent</Badge>}
                <Badge tone={statusTone(r.status)}>{displayOrderStatus(r.status)}</Badge>
              </span>
            ),
          },
        ]}
        rows={data?.requests || []}
        empty={<EmptyState title="No orders in this list" body="When a hospital or clinic orders from this shop, the order appears here." />}
      />
    </div>
  );
}
