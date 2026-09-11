import { useState } from "react";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { Badge, Button, EmptyState, Modal, Select, Table } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function AppointmentsPage() {
  const { data, loading, error, reload, facilityId } = useApi("/api/appointments");
  const { user, formatDateTime } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const patients = useApi("/api/patients");
  const doctors = useApi("/api/doctors");
  const [form, setForm] = useState({ patientId: "", doctorUserId: "", scheduledAt: "", reason: "" });
  const [completeRow, setCompleteRow] = useState(null);

  async function create(e) {
    e.preventDefault();
    try {
      await api("/api/appointments", { method: "POST", body: form, facilityId });
      toast("Appointment booked.");
      setOpen(false);
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  async function act(id, status) {
    try {
      await api(`/api/appointments/${id}`, { method: "PATCH", body: { status }, facilityId });
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (error) return <p className="text-danger">{error}</p>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Appointments</h1>
          <p className="text-ink-soft">Booked → confirmed → checked in → waiting → in consultation → completed</p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Book appointment</Button>
      </div>
      <Table
        columns={[
          { key: "when", label: "When", render: (r) => formatDateTime(r.scheduledAt) },
          { key: "patient", label: "Patient", render: (r) => r.patientId?.name },
          { key: "doctor", label: "Doctor", render: (r) => r.doctorUserId?.name },
          { key: "reason", label: "Reason" },
          {
            key: "status",
            label: "Status",
            render: (r) => <Badge>{statusLabel(r.status)}</Badge>,
          },
          {
            key: "a",
            label: "",
            render: (r) => (
              <div className="flex flex-wrap gap-2">
                {r.status === "BOOKED" && (
                  <Button variant="secondary" onClick={() => act(r._id, "CONFIRMED")}>
                    Confirm
                  </Button>
                )}
                {["BOOKED", "CONFIRMED"].includes(r.status) && (
                  <Button variant="outline" onClick={() => api(`/api/appointments/${r._id}/check-in`, { method: "POST", facilityId }).then(reload)}>
                    Check in
                  </Button>
                )}
                {user?.role === "DOCTOR" && ["WAITING", "IN_CONSULTATION"].includes(r.status) && (
                  <Button onClick={() => setCompleteRow(r)}>Complete consultation</Button>
                )}
                {r.status !== "CANCELLED" && r.status !== "COMPLETED" && (
                  <Button variant="ghost" onClick={() => act(r._id, "CANCELLED")}>
                    Cancel
                  </Button>
                )}
              </div>
            ),
          },
        ]}
        rows={data?.appointments || []}
        empty={!loading && <EmptyState title="No appointments" body="Book a slot to start the day's flow." action={<Button onClick={() => setOpen(true)}>+ Book</Button>} />}
      />
      <Modal open={open} onClose={() => setOpen(false)} title="New appointment">
        <form className="space-y-3" onSubmit={create}>
          <Select label="Patient" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} required>
            <option value="">Select</option>
            {patients.data?.patients?.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.mrn})
              </option>
            ))}
          </Select>
          {user?.role === "FACILITY_ADMIN" && (
            <Select label="Doctor" value={form.doctorUserId} onChange={(e) => setForm({ ...form, doctorUserId: e.target.value })} required>
              <option value="">Select</option>
              {doctors.data?.doctors
                ?.filter((d) => d.status === "ACTIVE")
                .map((d) => (
                  <option key={d._id} value={d.userId?._id || d.userId}>
                    {d.userId?.name}
                  </option>
                ))}
            </Select>
          )}
          <label className="block text-sm font-medium">
            Date and time
            <input
              type="datetime-local"
              className="mt-1 min-h-11 w-full rounded-xl border border-line px-3"
              value={form.scheduledAt}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Reason
            <input className="mt-1 min-h-11 w-full rounded-xl border border-line px-3" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>
          <Button type="submit">Save</Button>
        </form>
      </Modal>
      <Modal open={!!completeRow} title="Complete consultation" onClose={() => setCompleteRow(null)}>
        <p className="text-sm text-ink-soft">Are you sure you want to mark this consultation as completed?</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-soft">Patient</dt>
            <dd className="font-semibold">{completeRow?.patientId?.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-soft">Appointment</dt>
            <dd>{completeRow?.scheduledAt ? new Date(completeRow.scheduledAt).toLocaleString() : "—"}</dd>
          </div>
        </dl>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCompleteRow(null)}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              try {
                await api(`/api/appointments/${completeRow._id}/complete`, { method: "POST", facilityId });
                toast("Consultation completed successfully.");
                setCompleteRow(null);
                reload();
              } catch (err) {
                toast(err.message, "danger");
              }
            }}
          >
            Complete consultation
          </Button>
        </div>
      </Modal>
    </div>
  );
}
