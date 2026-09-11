import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, EmptyState, Table } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function NetworkDoctorsPage() {
  const { data, reload, error } = useApi("/api/admin/doctors");
  const toast = useToast();

  async function suspend(userId) {
    try {
      await api(`/api/admin/users/${userId}/status`, { method: "POST", body: { status: "SUSPENDED" } });
      toast("Account suspended. The action is audited.");
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (error) return <p className="text-danger">{error}</p>;

  return (
    <div>
      <h1 className="font-display text-4xl">Network doctors</h1>
      <p className="text-ink-soft">Verified professionals and their facility associations. Clinical records are not listed here.</p>
      <div className="mt-6">
        <Table
          columns={[
            { key: "n", label: "Name", render: (r) => r.userId?.name },
            { key: "s", label: "Specialization" },
            { key: "reg", label: "Registration" },
            {
              key: "f",
              label: "Facilities",
              render: (r) => (r.facilities || []).map((f) => f?.name).filter(Boolean).join(", ") || "—",
            },
            {
              key: "v",
              label: "",
              render: (r) => (r.credentialsVerified ? <Badge tone="ok">✓ Verified Professional</Badge> : <Badge>Pending</Badge>),
            },
            {
              key: "a",
              label: "",
              render: (r) =>
                r.userId?.status === "ACTIVE" ? (
                  <Button variant="outline" onClick={() => suspend(r.userId?._id || r.userId)}>
                    Suspend
                  </Button>
                ) : (
                  <Badge tone="danger">{r.userId?.status}</Badge>
                ),
            },
          ]}
          rows={data?.doctors || []}
          empty={<EmptyState title="No verified doctors" body="Doctors appear after credential verification." />}
        />
      </div>
    </div>
  );
}
