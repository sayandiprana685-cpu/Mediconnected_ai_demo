import { Link } from "react-router-dom";
import { useState } from "react";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { Badge, Button, EmptyState, Select, Table } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { isPharmacyType } from "../../utils/facilityKinds.js";

export default function PrescriptionsPage() {
  const { data, error, reload, facilityId } = useApi("/api/prescriptions");
  const network = useApi("/api/network/facilities");
  const { user } = useAuth();
  const toast = useToast();
  const isDoctor = user?.role === "DOCTOR";
  const [sendId, setSendId] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");

  async function send(e) {
    e.preventDefault();
    try {
      await api(`/api/prescriptions/${sendId}/send-pharmacy`, { method: "POST", facilityId, body: { pharmacyFacilityId: pharmacyId } });
      toast("Sent to pharmacy.");
      setSendId("");
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (error) return <p className="text-danger">{error}</p>;

  const rows = data?.prescriptions || [];
  const pharmacies = (network.data?.facilities || []).filter((f) => isPharmacyType(f.type));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Prescriptions</h1>
          <p className="text-ink-soft">
            {isDoctor
              ? "Draft, preview, finalize, and download A4 prescriptions for your patients."
              : "Facility copies of prescriptions issued here. Clinical finalization stays with the doctor."}
          </p>
        </div>
        {isDoctor && (
          <Link to="/app/prescriptions/new">
            <Button>+ Write prescription</Button>
          </Link>
        )}
      </div>
      <Table
        columns={[
          {
            key: "p",
            label: "Patient",
            render: (r) => (
              <Link className="font-semibold text-teal-800" to={`/app/prescriptions/${r._id}`}>
                {r.patientId?.name || r.patientSnapshot?.name}
              </Link>
            ),
          },
          { key: "mrn", label: "ID", render: (r) => r.patientId?.mrn || r.patientSnapshot?.mrn },
          { key: "d", label: "Doctor", render: (r) => r.doctorUserId?.name },
          {
            key: "n",
            label: "Medicines",
            render: (r) => (r.medicines?.length ? r.medicines.length : r.items?.length) || 0,
          },
          {
            key: "s",
            label: "Status",
            render: (r) => <Badge tone={r.status === "DRAFT" ? "warn" : "ok"}>{statusLabel(r.status || "FINALIZED")}</Badge>,
          },
          {
            key: "send",
            label: "",
            render: (r) =>
              r.status !== "DRAFT" ? (
                <Button variant="outline" onClick={() => setSendId(r._id)}>
                  Send to pharmacy
                </Button>
              ) : null,
          },
        ]}
        rows={rows}
        empty={
          <EmptyState
            title="No prescriptions yet"
            body="Create a draft, add medicines dynamically, then preview and finalize."
            action={
              isDoctor ? (
                <Link to="/app/prescriptions/new">
                  <Button>+ Write prescription</Button>
                </Link>
              ) : null
            }
          />
        }
      />
      {sendId && (
        <form className="mt-6 flex max-w-lg flex-wrap items-end gap-3" onSubmit={send}>
          <Select label="Pharmacy" value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)} required>
            <option value="">Select a verified pharmacy</option>
            {pharmacies.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name} ({f.type?.replaceAll("_", " ")})
              </option>
            ))}
          </Select>
          <Button type="submit">Send</Button>
          <Button type="button" variant="ghost" onClick={() => setSendId("")}>
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
