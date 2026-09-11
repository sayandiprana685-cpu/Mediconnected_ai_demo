import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, EmptyState, Modal, Select, Table } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

const NEXT = {
  REQUESTED: "ACCEPTED",
  ACCEPTED: "SAMPLE_PENDING",
  SAMPLE_PENDING: "SAMPLE_COLLECTED",
  SAMPLE_COLLECTED: "PROCESSING",
  PROCESSING: "REPORT_READY",
  REPORT_READY: "DELIVERED",
};

export default function LabOrdersPage() {
  const { data, reload, facilityId, error } = useApi("/api/diagnostics/orders");
  const tests = useApi("/api/diagnostics/tests");
  const patients = useApi("/api/patients");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patientId: "", testId: "", urgency: "ROUTINE" });

  async function create(e) {
    e.preventDefault();
    try {
      await api("/api/diagnostics/orders", { method: "POST", facilityId, body: form });
      toast("Order created.");
      setOpen(false);
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  async function advance(id, status) {
    try {
      await api(`/api/diagnostics/orders/${id}/status`, { method: "PATCH", facilityId, body: { status } });
      toast("Order updated.");
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
          <h1 className="font-display text-4xl">Test orders</h1>
          <p className="text-ink-soft">Requested → accepted → sample → processing → report. Invalid jumps are rejected by the server.</p>
        </div>
        <Button onClick={() => setOpen(true)}>+ New order</Button>
      </div>
      <Table
        columns={[
          {
            key: "p",
            label: "Patient",
            render: (r) => (
              <Link className="font-semibold text-teal-800" to={`/app/lab-orders/${r._id}`}>
                {r.patientId?.name}
              </Link>
            ),
          },
          { key: "t", label: "Test", render: (r) => r.testName },
          { key: "u", label: "Urgency", render: (r) => r.urgency },
          { key: "s", label: "Status", render: (r) => <Badge>{statusLabel(r.status)}</Badge> },
          {
            key: "a",
            label: "",
            render: (r) =>
              NEXT[r.status] ? (
                <Button variant="outline" onClick={() => advance(r._id, NEXT[r.status])}>
                  Mark {statusLabel(NEXT[r.status])}
                </Button>
              ) : null,
          },
        ]}
        rows={data?.orders || []}
        empty={<EmptyState title="No orders" body="Create an order after registering the patient at this centre." />}
      />
      <Modal open={open} title="New test order" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={create}>
          <Select label="Patient" required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
            <option value="">Select</option>
            {(patients.data?.patients || []).map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.mrn})
              </option>
            ))}
          </Select>
          <Select label="Test" required value={form.testId} onChange={(e) => setForm({ ...form, testId: e.target.value })}>
            <option value="">Select</option>
            {(tests.data?.tests || []).filter((t) => t.status !== "INACTIVE").map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select label="Urgency" value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
            <option value="ROUTINE">Routine</option>
            <option value="URGENT">Urgent</option>
            <option value="CRITICAL">Critical</option>
          </Select>
          <Button type="submit">Create</Button>
        </form>
      </Modal>
    </div>
  );
}
