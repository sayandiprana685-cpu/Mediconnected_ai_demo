import { useState } from "react";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, EmptyState, Input, Modal, Select, Table } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

const blank = {
  name: "",
  genericName: "",
  brandName: "",
  strength: "",
  dosageForm: "",
  manufacturer: "",
  batchNumber: "",
  expiryDate: "",
  quantity: "0",
  reorderLevel: "10",
  unitPrice: "",
  prescriptionRequired: true,
  status: "ACTIVE",
};

export default function MedicinesPage() {
  const { data, reload, facilityId, error } = useApi("/api/pharmacy/medicines");
  const toast = useToast();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [stock, setStock] = useState({ id: "", delta: "" });

  const rows = (data?.medicines || []).filter((m) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return [m.name, m.genericName, m.brandName, m.batchNumber].some((v) => String(v || "").toLowerCase().includes(s));
  });

  async function save(e) {
    e.preventDefault();
    try {
      if (editing) await api(`/api/pharmacy/medicines/${editing._id}`, { method: "PATCH", facilityId, body: form });
      else await api("/api/pharmacy/medicines", { method: "POST", facilityId, body: form });
      toast("Medicine saved.");
      setOpen(false);
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  async function adjust(e) {
    e.preventDefault();
    try {
      await api(`/api/pharmacy/medicines/${stock.id}/stock`, { method: "POST", facilityId, body: { delta: Number(stock.delta) } });
      toast("Stock updated.");
      setStock({ id: "", delta: "" });
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (error) return <p className="text-danger">{error}</p>;
  const soon = Date.now() + 30 * 86400000;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Medicines</h1>
          <p className="text-ink-soft">Inventory for this pharmacy. Low stock and expiry are highlighted.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setForm(blank);
            setOpen(true);
          }}
        >
          + Add medicine
        </Button>
      </div>
      <Input className="mb-4 max-w-sm" label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      <Table
        columns={[
          { key: "name", label: "Medicine" },
          { key: "genericName", label: "Generic" },
          { key: "strength", label: "Strength" },
          { key: "batchNumber", label: "Batch" },
          {
            key: "qty",
            label: "Qty",
            render: (r) => (
              <span className={r.quantity <= 0 ? "text-danger" : r.quantity <= (r.reorderLevel || 0) ? "text-warn" : ""}>
                {r.quantity}
              </span>
            ),
          },
          {
            key: "exp",
            label: "Expiry",
            render: (r) => {
              if (!r.expiryDate) return "—";
              const t = new Date(r.expiryDate).getTime();
              return <span className={t < soon ? "text-warn" : ""}>{new Date(r.expiryDate).toLocaleDateString()}</span>;
            },
          },
          { key: "st", label: "Status", render: (r) => <Badge>{r.status}</Badge> },
          {
            key: "a",
            label: "",
            render: (r) => (
              <span className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(r);
                    setForm({
                      name: r.name || "",
                      genericName: r.genericName || "",
                      brandName: r.brandName || "",
                      strength: r.strength || "",
                      dosageForm: r.dosageForm || "",
                      manufacturer: r.manufacturer || "",
                      batchNumber: r.batchNumber || "",
                      expiryDate: r.expiryDate ? String(r.expiryDate).slice(0, 10) : "",
                      quantity: r.quantity,
                      reorderLevel: r.reorderLevel,
                      unitPrice: r.unitPrice ?? "",
                      prescriptionRequired: r.prescriptionRequired !== false,
                      status: r.status,
                    });
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setStock({ id: r._id, delta: "" })}>
                  Stock
                </Button>
              </span>
            ),
          },
        ]}
        rows={rows}
        empty={<EmptyState title="No medicines" body="Add stock for this shop only." />}
      />
      <Modal
        open={open}
        title={editing ? "Edit medicine" : "Add medicine"}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex flex-wrap gap-2">
            <Button type="submit" form="medicine-form">
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        }
      >
        <form id="medicine-form" className="space-y-3" onSubmit={save}>
          <Input label="Medicine name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Generic name" value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} />
          <Input label="Brand name" value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} />
          <Input label="Strength" value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} />
          <Input label="Dosage form" value={form.dosageForm} onChange={(e) => setForm({ ...form, dosageForm: e.target.value })} />
          <Input label="Manufacturer" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
          <Input label="Batch number" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} />
          <Input label="Expiry date" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
          {!editing && <Input label="Quantity" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />}
          <Input label="Reorder level" type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
          <Input label="Unit price" type="number" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
          <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </form>
      </Modal>
      <Modal open={!!stock.id} title="Adjust stock" onClose={() => setStock({ id: "", delta: "" })}>
        <form className="space-y-3" onSubmit={adjust}>
          <Input label="Change (+/-)" type="number" required value={stock.delta} onChange={(e) => setStock({ ...stock, delta: e.target.value })} />
          <Button type="submit">Apply</Button>
        </form>
      </Modal>
    </div>
  );
}
