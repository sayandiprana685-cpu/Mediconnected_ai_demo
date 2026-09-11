import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Button, EmptyState, Input, Modal, Table } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function PatientsPage() {
  const { data, reload, facilityId, error } = useApi("/api/patients");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", age: "", sex: "Female", phone: "", city: "", district: "", allergies: "" });

  async function create(e) {
    e.preventDefault();
    try {
      await api("/api/patients", {
        method: "POST",
        facilityId,
        body: { ...form, age: Number(form.age), allergies: form.allergies.split(",").map((s) => s.trim()).filter(Boolean) },
      });
      toast("Patient registered for this facility workflow.");
      setOpen(false);
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (error) return <p className="text-danger">{error}</p>;

  return (
    <div>
      <div className="mb-6 flex justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Patients</h1>
          <p className="text-ink-soft">Only patients in your facility or assigned to you are listed.</p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Add patient</Button>
      </div>
      <Table
        columns={[
          { key: "mrn", label: "MRN" },
          {
            key: "name",
            label: "Name",
            render: (r) => (
              <Link className="font-semibold text-teal-800" to={`/app/patients/${r._id}`}>
                {r.name}
              </Link>
            ),
          },
          { key: "age", label: "Age" },
          { key: "sex", label: "Sex" },
          { key: "city", label: "City" },
        ]}
        rows={data?.patients || []}
        empty={<EmptyState title="No patients in this workspace" body="Register a patient to begin appointments and consultations." action={<Button onClick={() => setOpen(true)}>+ Add patient</Button>} />}
      />
      <Modal open={open} title="Register patient" onClose={() => setOpen(false)}>
        <form className="grid gap-3" onSubmit={create}>
          <Input label="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Age" type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
            <label className="text-sm">
              Sex
              <select className="mt-1 min-h-11 w-full rounded-xl border border-line px-3" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </label>
          </div>
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Input label="Known allergies (comma separated)" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} />
          <Button type="submit">Save</Button>
        </form>
      </Modal>
    </div>
  );
}
