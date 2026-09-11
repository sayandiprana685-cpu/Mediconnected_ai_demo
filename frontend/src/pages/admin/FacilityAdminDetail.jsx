import { useState } from "react";
import { useParams } from "react-router-dom";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, Card, Skeleton, Table } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function FacilityAdminDetail() {
  const { id } = useParams();
  const { data, loading, error, reload } = useApi(`/api/admin/facilities/${id}`);
  const toast = useToast();
  const [reason, setReason] = useState("");

  async function decide(decision) {
    try {
      await api(`/api/admin/facilities/${id}/decision`, { method: "POST", body: { decision, reason } });
      toast(decision === "VERIFY" ? "Facility verified." : "Facility rejected.");
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (loading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-danger">{error}</p>;
  const f = data.facility;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-ink-soft uppercase">{f.district}</p>
          <h1 className="font-display text-4xl">{f.name}</h1>
          <p className="text-ink-soft">
            {f.type?.replaceAll("_", " ")} · {f.city} · Licence {f.licenceNumber}
          </p>
        </div>
        <Badge tone={f.status === "VERIFIED" ? "ok" : "warn"}>{statusLabel(f.status)}</Badge>
      </div>
      {f.status !== "VERIFIED" && (
        <Card className="p-5">
          <h2 className="font-display text-2xl">Verification decision</h2>
          <p className="text-sm text-ink-soft">Review licence details, then verify or reject. This is logged in the audit trail.</p>
          <textarea
            className="mt-3 min-h-20 w-full rounded-xl border border-line px-3 py-2"
            placeholder="Notes for the facility (required when rejecting)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => decide("VERIFY")}>Verify facility</Button>
            <Button variant="outline" onClick={() => decide("REQUEST_CORRECTION")}>
              Request correction
            </Button>
            <Button variant="danger" onClick={() => decide("REJECT")}>
              Reject
            </Button>
          </div>
        </Card>
      )}
      <Card className="p-5">
        <h2 className="font-display text-2xl">Operational flags</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <li>Emergency: {f.emergencyAvailable ? "Yes" : "No"}</li>
          <li>Diagnostics: {f.diagnosticAvailable ? "Yes" : "No"}</li>
          <li>Medicine: {f.medicineAvailable ? "Yes" : "No"}</li>
          <li>Occupancy hint: {f.occupancyHint || 0}%</li>
        </ul>
      </Card>
      <Card className="p-5">
        <h2 className="font-display text-2xl">Active doctors</h2>
        <Table
          columns={[
            { key: "n", label: "Name", render: (r) => r.userId?.name },
            { key: "e", label: "Email", render: (r) => r.userId?.email },
          ]}
          rows={data.doctors || []}
        />
      </Card>
    </div>
  );
}
