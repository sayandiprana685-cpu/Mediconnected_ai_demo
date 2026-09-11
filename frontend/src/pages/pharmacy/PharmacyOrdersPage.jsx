import { Link } from "react-router-dom";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { Badge, EmptyState, Table } from "../../components/ui/index.jsx";

export default function PharmacyOrdersPage() {
  const { data, error } = useApi("/api/pharmacy/orders");
  if (error) return <p className="text-danger">{error}</p>;
  return (
    <div>
      <h1 className="font-display text-4xl">Pharmacy orders</h1>
      <p className="text-ink-soft">Only prescriptions sent to this pharmacy are listed.</p>
      <div className="mt-6">
        <Table
          columns={[
            {
              key: "p",
              label: "Patient",
              render: (r) => (
                <Link className="font-semibold text-teal-800" to={`/app/pharmacy-orders/${r._id}`}>
                  {r.patientId?.name}
                </Link>
              ),
            },
            { key: "from", label: "From", render: (r) => r.sourceFacilityId?.name },
            { key: "s", label: "Status", render: (r) => <Badge>{statusLabel(r.status)}</Badge> },
            { key: "t", label: "Received", render: (r) => new Date(r.createdAt).toLocaleString() },
          ]}
          rows={data?.orders || []}
          empty={<EmptyState title="No prescriptions received" body="Doctors send finalized prescriptions to this pharmacy." />}
        />
      </div>
    </div>
  );
}
