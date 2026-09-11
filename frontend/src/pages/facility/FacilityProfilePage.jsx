import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { Badge, Button, Card, Input, Skeleton } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function FacilityProfilePage() {
  const { data, loading, error, reload, facilityId } = useApi("/api/facilities/me");
  const { applyFacility, refresh } = useAuth();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", contactNumber: "", officialEmail: "", address: "", website: "" });
  const f = data?.facility;

  useEffect(() => {
    if (!f) return;
    setForm({
      name: f.name || "",
      contactNumber: f.contactNumber || "",
      officialEmail: f.officialEmail || "",
      address: f.address || "",
      website: f.website || "",
    });
  }, [f]);

  async function save(e) {
    e.preventDefault();
    const name = String(form.name || "").trim();
    if (name.length < 2) return toast("Facility name cannot be empty.", "danger");
    setSaving(true);
    try {
      const res = await api("/api/facilities/me", { method: "PATCH", facilityId, body: { ...form, name } });
      toast(res.message || "Settings saved successfully.");
      if (res.facility) applyFacility(res.facility);
      setEdit(false);
      await refresh();
      await reload({ silent: true });
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-danger">{error}</p>;
  const lat = f.geo?.lat;
  const lng = f.geo?.lng;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.2em] text-teal-800 uppercase">{f.type?.replaceAll("_", " ")}</p>
          <h1 className="font-display text-4xl">{form.name || f.name}</h1>
          <p className="text-ink-soft">
            {f.address}, {f.city}, {f.district}, {f.state} {f.pin}
          </p>
        </div>
        {f.status === "VERIFIED" ? <Badge tone="ok">✓ Verified Facility</Badge> : <Badge tone="warn">{f.status?.replaceAll("_", " ")}</Badge>}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase text-ink-soft">Licence</p>
          <p className="mt-2 font-semibold">{f.licenceNumber}</p>
          <p className="text-xs text-ink-soft">{f.licenceAuthority}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase text-ink-soft">Emergency</p>
          <p className="mt-2 font-semibold">{f.emergencyAvailable ? "Available" : "Not advertised"}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase text-ink-soft">Diagnostics / medicine</p>
          <p className="mt-2 text-sm">
            Diagnostics: {f.diagnosticAvailable ? "Yes" : "No"}
            <br />
            Medicine: {f.medicineAvailable ? "Yes" : "No"}
          </p>
        </Card>
      </div>
      {lat != null && lng != null && (
        <Card className="overflow-hidden">
          <iframe
            title="Facility map"
            className="h-64 w-full border-0"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.04}%2C${lat - 0.03}%2C${lng + 0.04}%2C${lat + 0.03}&layer=mapnik&marker=${lat}%2C${lng}`}
          />
        </Card>
      )}
      <Card className="p-5">
        <h2 className="font-display text-2xl">Departments</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.departments?.map((d) => (
            <Badge key={d._id}>{d.name}</Badge>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="font-display text-2xl">Facility details</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Working hours, type, and notifications are in{" "}
          <Link className="font-semibold text-teal-800" to="/app/settings">
            Settings
          </Link>
          . Verification cannot be changed here.
        </p>
        <form className="mt-4 max-w-md space-y-3" onSubmit={save}>
          <Input
            label="Facility name"
            disabled={!edit}
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input label="Contact number" disabled={!edit} value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
          <Input label="Official email" type="email" disabled={!edit} value={form.officialEmail} onChange={(e) => setForm({ ...form, officialEmail: e.target.value })} />
          <Input label="Address" disabled={!edit} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label="Website" disabled={!edit} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          {!edit ? (
            <Button type="button" variant="outline" onClick={() => setEdit(true)}>
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setEdit(false); reload({ silent: true }); }}>
                Cancel
              </Button>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
