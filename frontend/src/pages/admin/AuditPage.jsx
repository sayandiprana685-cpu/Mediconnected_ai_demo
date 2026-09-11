import { useApi } from "../../hooks/useApi.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { EmptyState, Table } from "../../components/ui/index.jsx";

export default function AuditPage() {
  const { formatDateTime } = useAuth();
  const { data, error } = useApi("/api/admin/audit");
  if (error) return <p className="text-danger">{error}</p>;
  return (
    <div>
      <h1 className="font-display text-4xl">Audit logs</h1>
      <p className="text-ink-soft">Actor, action, resource, time. Patient-level views by clinicians are recorded here.</p>
      <div className="mt-6">
        <Table
          columns={[
            { key: "t", label: "When", render: (r) => formatDateTime(r.createdAt) },
            { key: "a", label: "Actor", render: (r) => r.actorId?.name || r.actorRole },
            { key: "role", label: "Role", render: (r) => r.actorRole || r.actorId?.role },
            { key: "action", label: "Action" },
            { key: "resource", label: "Resource" },
            { key: "ip", label: "IP", render: (r) => r.ip || "—" },
          ]}
          rows={data?.logs || []}
          empty={<EmptyState title="No audit events yet" body="Logins, verifications, and clinical writes appear as they happen." />}
        />
      </div>
    </div>
  );
}
