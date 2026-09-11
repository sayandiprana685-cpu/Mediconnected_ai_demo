import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { Badge, Button, EmptyState, Table } from "../../components/ui/index.jsx";
import { useState } from "react";
import { displayOrderStatus, statusTone } from "../../utils/medicineOrder.js";

const TABS = [
  ["ALL", "All"],
  ["PENDING", "Pending"],
  ["ACCEPTED", "Accepted"],
  ["PREPARING", "Preparing"],
  ["READY", "Ready"],
  ["OUT_FOR_DELIVERY", "Out for delivery"],
  ["READY_FOR_PICKUP", "Ready for pickup"],
  ["COMPLETED", "Completed"],
  ["REJECTED", "Rejected"],
  ["CANCELLED", "Cancelled"],
];

export default function MedicineOrdersPage() {
  const [tab, setTab] = useState("ALL");
  const { data, error } = useApi(`/api/procurement/requests?tab=${tab}`, [tab], { pollMs: 10000 });
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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Medicine orders</h1>
          <p className="text-ink-soft">Orders placed by this facility. Status updates when the pharmacy acts.</p>
        </div>
        <Link to="/app/medicine-orders/new">
          <Button>Order medicines</Button>
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-h-9 rounded-full px-3 text-sm ${tab === id ? "bg-teal-900 text-white" : "border border-line bg-paper-2"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Table
        columns={[
          {
            key: "id",
            label: "Order / request",
            render: (r) => (
              <Link className="font-semibold text-teal-800" to={`/app/medicine-orders/${r._id}`}>
                {r.requestNo}
              </Link>
            ),
          },
          { key: "p", label: "Pharmacy", render: (r) => r.pharmacy?.name },
          { key: "c", label: "City", render: (r) => r.pharmacy?.city },
          { key: "n", label: "Medicines", render: (r) => r.medicineCount },
          { key: "q", label: "Total qty", render: (r) => r.totalQty },
          { key: "d", label: "Date", render: (r) => new Date(r.createdAt).toLocaleString() },
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
        empty={<EmptyState title="No medicine orders" body="Search medicines and send a request to a verified pharmacy." />}
      />
    </div>
  );
}
