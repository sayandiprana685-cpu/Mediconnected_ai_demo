import { useState } from "react";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { Badge, Button, Card, EmptyState, Modal, Select, Timeline } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function ReferralsPage() {
  const { data, reload, facilityId, error } = useApi("/api/referrals");
  const { user } = useAuth();
  const toast = useToast();
  const patients = useApi("/api/patients");
  const network = useApi("/api/network/facilities");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patientId: "", toFacilityId: "", reason: "", specialty: "", priority: "ROUTINE" });

  async function create(e) {
    e.preventDefault();
    try {
      await api("/api/referrals", { method: "POST", body: form, facilityId });
      toast("Referral created.");
      setOpen(false);
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  async function advance(id, status) {
    await api(`/api/referrals/${id}`, { method: "PATCH", body: { status }, facilityId });
    reload();
  }

  if (error) return <p className="text-danger">{error}</p>;

  return (
    <div>
      <div className="mb-6 flex justify-between">
        <div>
          <h1 className="font-display text-4xl">Referrals</h1>
          <p className="text-ink-soft">Continuity of care as a lifecycle, not a one-off form.</p>
        </div>
        {user?.role === "DOCTOR" && <Button onClick={() => setOpen(true)}>+ Create referral</Button>}
      </div>
      <div className="grid gap-4">
        {data?.referrals?.map((r) => (
          <Card key={r._id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">{r.patientId?.name}</h2>
                <p className="text-sm text-ink-soft">
                  {r.fromFacilityId?.name} → {r.toFacilityId?.name} · {r.specialty} · {r.priority}
                </p>
                <p className="mt-2 text-sm">{r.reason}</p>
              </div>
              <Badge tone="warn">{statusLabel(r.status)}</Badge>
            </div>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <Timeline
                steps={(r.timeline || []).map((t) => ({
                  title: statusLabel(t.status),
                  meta: new Date(t.at).toLocaleString() + (t.note ? ` · ${t.note}` : ""),
                  done: true,
                }))}
              />
              {user?.role !== "DOCTOR" || user?.role === "FACILITY_ADMIN" || user?.role === "MAIN_ADMIN" ? (
                <div className="flex flex-wrap gap-2">
                  {r.status === "CREATED" && <Button onClick={() => advance(r._id, "ACCEPTED")}>Accept</Button>}
                  {r.status === "CREATED" && (
                    <Button variant="outline" onClick={() => advance(r._id, "DECLINED")}>
                      Decline
                    </Button>
                  )}
                  {r.status === "ACCEPTED" && (
                    <Button variant="secondary" onClick={() => advance(r._id, "APPOINTMENT_ASSIGNED")}>
                      Mark appointment assigned
                    </Button>
                  )}
                  {r.status === "CONSULTATION_COMPLETED" && <Button onClick={() => advance(r._id, "CLOSED")}>Close</Button>}
                </div>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
      {!data?.referrals?.length && <EmptyState title="No pending referrals" body="When a doctor refers a patient, the pathway will appear here." />}
      <Modal open={open} title="Create referral" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={create}>
          <Select label="Patient" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} required>
            <option value="">Select</option>
            {patients.data?.patients?.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select label="Receiving facility" value={form.toFacilityId} onChange={(e) => setForm({ ...form, toFacilityId: e.target.value })} required>
            <option value="">Select</option>
            {network.data?.facilities?.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name} ({f.type})
              </option>
            ))}
          </Select>
          <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option>ROUTINE</option>
            <option>URGENT</option>
            <option>EMERGENCY</option>
          </Select>
          <label className="block text-sm">
            Specialty
            <input className="mt-1 min-h-11 w-full rounded-xl border px-3" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
          </label>
          <label className="block text-sm">
            Clinical reason
            <textarea className="mt-1 w-full rounded-xl border px-3 py-2" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>
          <Button type="submit">Send referral</Button>
        </form>
      </Modal>
    </div>
  );
}
