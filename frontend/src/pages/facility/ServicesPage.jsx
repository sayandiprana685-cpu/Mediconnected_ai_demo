import { useState } from "react";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, EmptyState, Input, Modal, Select, Table } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function ServicesPage() {
  const { data, reload, facilityId, error } = useApi("/api/facilities/me");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [deptOpen, setDeptOpen] = useState(false);
  const [svc, setSvc] = useState({ name: "", category: "CONSULTATION" });
  const [dept, setDept] = useState("");

  async function addService(e) {
    e.preventDefault();
    try {
      await api("/api/facilities/me/services", { method: "POST", facilityId, body: svc });
      toast("Service added.");
      setOpen(false);
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  async function addDept(e) {
    e.preventDefault();
    try {
      await api("/api/facilities/me/departments", { method: "POST", facilityId, body: { name: dept } });
      toast("Department added.");
      setDeptOpen(false);
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (error) return <p className="text-danger">{error}</p>;

  return (
    <div className="space-y-10">
      <div className="flex justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Services & departments</h1>
          <p className="text-ink-soft">What this facility can offer on the care network.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDeptOpen(true)}>
            + Department
          </Button>
          <Button onClick={() => setOpen(true)}>+ Service</Button>
        </div>
      </div>
      <section>
        <h2 className="font-display text-2xl">Departments</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {data?.departments?.map((d) => (
            <Badge key={d._id}>{d.name}</Badge>
          ))}
        </div>
        {!data?.departments?.length && <EmptyState title="No departments" body="Add clinical units such as Emergency or Paediatrics." />}
      </section>
      <section>
        <h2 className="font-display text-2xl">Services</h2>
        <Table
          columns={[
            { key: "name", label: "Service" },
            { key: "category", label: "Category" },
            { key: "available", label: "Available", render: (r) => (r.available ? <Badge tone="ok">Yes</Badge> : <Badge>No</Badge>) },
          ]}
          rows={data?.services || []}
          empty={<EmptyState title="No services listed" body="Describe consultation, diagnostics, pharmacy, or emergency capacity." />}
        />
      </section>
      <Modal open={open} title="Add service" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={addService}>
          <Input label="Name" required value={svc.name} onChange={(e) => setSvc({ ...svc, name: e.target.value })} />
          <Select label="Category" value={svc.category} onChange={(e) => setSvc({ ...svc, category: e.target.value })}>
            <option>CONSULTATION</option>
            <option>DIAGNOSTIC</option>
            <option>PHARMACY</option>
            <option>EMERGENCY</option>
            <option>INPATIENT</option>
            <option>OTHER</option>
          </Select>
          <Button type="submit">Save</Button>
        </form>
      </Modal>
      <Modal open={deptOpen} title="Add department" onClose={() => setDeptOpen(false)}>
        <form className="space-y-3" onSubmit={addDept}>
          <Input label="Name" required value={dept} onChange={(e) => setDept(e.target.value)} />
          <Button type="submit">Save</Button>
        </form>
      </Modal>
    </div>
  );
}
