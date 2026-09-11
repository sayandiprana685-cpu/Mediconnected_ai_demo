import { useState } from "react";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Button, EmptyState, Input, Modal, Select, Table } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useAuth } from "../../hooks/useAuth.jsx";
import { facilityKind } from "../../utils/facilityKinds.js";

export default function StaffPage() {
  const { facilities, facilityId } = useAuth();
  const { data, error, reload } = useApi("/api/staff");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "LAB_TECH" });
  const kind = facilityKind((facilities.find((f) => String(f._id) === String(facilityId)) || facilities[0])?.type);

  async function save(e) {
    e.preventDefault();
    try {
      await api("/api/staff", { method: "POST", facilityId, body: form });
      toast("Staff account created.");
      setOpen(false);
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
          <h1 className="font-display text-4xl">Staff</h1>
          <p className="text-ink-soft">Accounts linked to this provider only. Roles are limited to this facility’s work.</p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Add staff</Button>
      </div>
      <Table
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "role", label: "Role" },
          { key: "phone", label: "Phone" },
          { key: "status", label: "Status" },
        ]}
        rows={data?.staff || []}
        empty={<EmptyState title="No staff listed" body="Your administrator account appears here after registration." />}
      />
      <Modal open={open} title="Add staff" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={save}>
          <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Password" type="password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {kind === "diagnostic" && (
              <>
                <option value="LAB_TECH">Lab technician</option>
                <option value="LAB_REVIEWER">Pathologist / reviewer</option>
                <option value="FACILITY_ADMIN">Facility admin</option>
              </>
            )}
            {kind === "pharmacy" && (
              <>
                <option value="PHARMACIST">Pharmacist</option>
                <option value="PHARMACY_STAFF">Pharmacy staff</option>
                <option value="FACILITY_ADMIN">Pharmacy admin</option>
              </>
            )}
            {kind === "clinical" && <option value="FACILITY_ADMIN">Facility admin</option>}
          </Select>
          <Button type="submit">Create account</Button>
        </form>
      </Modal>
    </div>
  );
}
