import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { Badge, EmptyState, Skeleton, Table } from "../../components/ui/index.jsx";
import { displayOrderStatus, statusTone } from "../../utils/medicineOrder.js";

export default function AdminMedicineOrdersPage() {
  const { data, error, loading } = useApi("/api/admin/medicine-orders", [], { pollMs: 15000 });
  if (loading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-danger">{error}</p>;
  return (
    <div>
      <h1 className="font-display text-4xl">Medicine orders</h1>
      <p className="text-ink-soft">Network-wide facility-to-pharmacy orders. Inspection only.</p>
      <div className="mt-6">
        <Table
          columns={[
            {
              key: "id",
              label: "Order ID",
              render: (r) => (
                <Link className="font-semibold text-teal-800" to={`/app/admin-medicine-orders/${r._id}`}>
                  {r.requestNo}
                </Link>
              ),
            },
            { key: "shop", label: "Shop", render: (r) => r.shop?.name },
            { key: "fac", label: "Facility", render: (r) => r.facility?.name },
            { key: "d", label: "Date", render: (r) => new Date(r.createdAt).toLocaleString() },
            { key: "m", label: "Method", render: (r) => (r.fulfillment === "DELIVERY" ? "Delivery" : "Pickup") },
            { key: "p", label: "Payment", render: (r) => (r.paymentStatus === "QUOTED" ? "Quoted" : "Not collected") },
            { key: "s", label: "Status", render: (r) => <Badge tone={statusTone(r.status)}>{displayOrderStatus(r.status)}</Badge> },
          ]}
          rows={data?.orders || []}
          empty={<EmptyState title="No medicine orders" body="Orders appear here after facilities place them." />}
        />
      </div>
    </div>
  );
}
