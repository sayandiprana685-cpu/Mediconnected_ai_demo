import { useState } from "react";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, EmptyState, Input, Modal, Select, Table } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

const blank = {
  name: "",
  code: "",
  category: "GENERAL",
  sampleType: "",
  preparation: "",
  turnaroundMinutes: "120",
  homeCollection: false,
  available: true,
  price: "",
  referenceRange: "",
  units: "",
  status: "ACTIVE",
};

export default function LabTestsPage() {
  const { data, reload, facilityId, error } = useApi("/api/diagnostics/tests");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);

  async function save(e) {
    e.preventDefault();
    try {
      if (editing) {
        await api(`/api/diagnostics/tests/${editing._id}`, { method: "PATCH", facilityId, body: form });
      } else {
        await api("/api/diagnostics/tests", { method: "POST", facilityId, body: form });
      }
      toast("Test saved.");
      setOpen(false);
      setEditing(null);
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
          <h1 className="font-display text-4xl">Tests</h1>
          <p className="text-ink-soft">Catalogue for this diagnostic centre. Add any test this laboratory performs.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setForm(blank);
            setOpen(true);
          }}
        >
          + Add test
        </Button>
      </div>
      <Table
        columns={[
          { key: "name", label: "Test" },
          { key: "code", label: "Code" },
          { key: "category", label: "Category" },
          { key: "sampleType", label: "Sample" },
          { key: "available", label: "Available", render: (r) => (r.available && r.status === "ACTIVE" ? <Badge tone="ok">Yes</Badge> : <Badge>No</Badge>) },
          {
            key: "a",
            label: "",
            render: (r) => (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(r);
                  setForm({
                    name: r.name || "",
                    code: r.code || "",
                    category: r.category || "GENERAL",
                    sampleType: r.sampleType || "",
                    preparation: r.preparation || "",
                    turnaroundMinutes: r.turnaroundMinutes || "",
                    homeCollection: !!r.homeCollection,
                    available: r.available !== false,
                    price: r.price ?? "",
                    referenceRange: r.referenceRange || "",
                    units: r.units || "",
                    status: r.status || "ACTIVE",
                  });
                  setOpen(true);
                }}
              >
                Edit
              </Button>
            ),
          },
        ]}
        rows={data?.tests || []}
        empty={<EmptyState title="No tests yet" body="Add blood work, imaging, or any other service this centre offers." />}
      />
      <Modal open={open} title={editing ? "Edit test" : "Add test"} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={save}>
          <Input label="Test name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Test code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Input label="Sample type" value={form.sampleType} onChange={(e) => setForm({ ...form, sampleType: e.target.value })} />
          <Input label="Preparation" value={form.preparation} onChange={(e) => setForm({ ...form, preparation: e.target.value })} />
          <Input label="Turnaround (minutes)" type="number" value={form.turnaroundMinutes} onChange={(e) => setForm({ ...form, turnaroundMinutes: e.target.value })} />
          <Input label="Price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <Input label="Reference range" value={form.referenceRange} onChange={(e) => setForm({ ...form, referenceRange: e.target.value })} />
          <Input label="Units" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
          <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.homeCollection} onChange={(e) => setForm({ ...form, homeCollection: e.target.checked })} />
            Home sample collection
          </label>
          <Button type="submit">Save</Button>
        </form>
      </Modal>
    </div>
  );
}
