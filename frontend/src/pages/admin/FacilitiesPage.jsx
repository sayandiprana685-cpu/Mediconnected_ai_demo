import { Link } from "react-router-dom";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { Badge, EmptyState, Table } from "../../components/ui/index.jsx";

export default function FacilitiesPage() {
  const { data, error } = useApi("/api/admin/facilities");
  if (error) return <p className="text-danger">{error}</p>;
  return (
    <div>
      <h1 className="font-display text-4xl">Facilities</h1>
      <p className="text-ink-soft">Network registry. Open a facility for verification and occupancy context.</p>
      <div className="mt-6">
        <Table
          columns={[
            {
              key: "name",
              label: "Facility",
              render: (r) => (
                <Link className="font-semibold text-teal-800" to={`/app/facilities/${r._id}`}>
                  {r.name}
                </Link>
              ),
            },
            { key: "type", label: "Type", render: (r) => r.type?.replaceAll("_", " ") },
            { key: "licenceNumber", label: "Registration no." },
            { key: "district", label: "District" },
            { key: "city", label: "City" },
            {
              key: "status",
              label: "Status",
              render: (r) => <Badge tone={r.status === "VERIFIED" ? "ok" : "warn"}>{statusLabel(r.status)}</Badge>,
            },
            { key: "createdAt", label: "Created", render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—") },
          ]}
          rows={data?.facilities || []}
          empty={<EmptyState title="No facilities" body="Registrations will appear here for review." />}
        />
      </div>
    </div>
  );
}
