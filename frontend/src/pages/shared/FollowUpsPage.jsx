import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, EmptyState, Table } from "../../components/ui/index.jsx";

export default function FollowUpsPage() {
  const { data, reload, facilityId } = useApi("/api/follow-ups");
  return (
    <div>
      <h1 className="font-display text-4xl">Follow-ups</h1>
      <p className="text-ink-soft">Patients who need a planned return visit.</p>
      <div className="mt-6">
        <Table
          columns={[
            { key: "p", label: "Patient", render: (r) => r.patientId?.name },
            { key: "reason", label: "Reason" },
            { key: "due", label: "Due", render: (r) => new Date(r.dueAt).toLocaleDateString() },
            { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> },
            {
              key: "a",
              label: "",
              render: (r) =>
                r.status !== "COMPLETED" ? (
                  <Button variant="secondary" onClick={() => api(`/api/follow-ups/${r._id}`, { method: "PATCH", body: { status: "COMPLETED" }, facilityId }).then(reload)}>
                    Mark complete
                  </Button>
                ) : null,
            },
          ]}
          rows={data?.followUps || []}
          empty={<EmptyState title="No follow-ups" body="Completed consultations can schedule a follow-up." />}
        />
      </div>
    </div>
  );
}
