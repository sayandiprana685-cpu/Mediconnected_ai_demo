import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { Badge, Button, Card, Input, Skeleton } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function DoctorProfilePage() {
  const { data, loading, error, reload } = useApi("/api/doctors/profile/me");
  const { applyUser, refresh } = useAuth();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    languages: "",
    teleconsultationAvailable: false,
    specialization: "",
    qualification: "",
    experienceYears: 0,
    photoUrl: "",
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.user?.name || "",
      languages: (data.profile?.languages || []).join(", "),
      teleconsultationAvailable: !!data.profile?.teleconsultationAvailable,
      specialization: data.profile?.specialization || "",
      qualification: data.profile?.qualification || "",
      experienceYears: data.profile?.experienceYears || 0,
      photoUrl: data.profile?.photoUrl || "",
    });
  }, [data]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api("/api/doctors/profile/me", {
        method: "PATCH",
        body: {
          name: form.name,
          languages: form.languages.split(",").map((s) => s.trim()).filter(Boolean),
          teleconsultationAvailable: form.teleconsultationAvailable,
          specialization: form.specialization,
          qualification: form.qualification,
          experienceYears: Number(form.experienceYears),
          photoUrl: form.photoUrl,
        },
      });
      toast(res.message || "Settings saved successfully.");
      if (res.user) applyUser(res.user);
      await refresh();
      setEdit(false);
      await reload({ silent: true });
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-danger">{error}</p>;
  const p = data.profile;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] text-teal-800 uppercase">Professional identity</p>
          <h1 className="font-display text-4xl">{data.user?.name}</h1>
          <p className="text-ink-soft">
            {p?.specialization} · {p?.qualification}
          </p>
        </div>
        {p?.credentialsVerified ? <Badge tone="ok">✓ Verified Professional</Badge> : <Badge tone="warn">Credentials pending</Badge>}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase text-ink-soft">Registration</p>
          <p className="mt-2 font-semibold">{p?.registrationNumber}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase text-ink-soft">Experience</p>
          <p className="mt-2 font-semibold">{p?.experienceYears} years</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase text-ink-soft">Availability</p>
          <p className="mt-2 font-semibold">{p?.availability}</p>
        </Card>
      </div>
      <Card className="p-5">
        <h2 className="font-display text-2xl">Facilities</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(data.facilities || []).map((f) => (
            <li key={f._id} className="flex justify-between border-b border-line py-2 last:border-0">
              <span>
                {f.name} · {f.city}
              </span>
              <Badge>{f.type?.replaceAll("_", " ")}</Badge>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <h2 className="font-display text-2xl">Professional details</h2>
        <form className="mt-4 space-y-3" onSubmit={save}>
          <Input label="Full name" disabled={!edit} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Specialization" disabled={!edit} value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
          <Input label="Qualification" disabled={!edit} value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} />
          <Input label="Experience (years)" type="number" disabled={!edit} value={form.experienceYears} onChange={(e) => setForm({ ...form, experienceYears: e.target.value })} />
          <Input label="Languages" disabled={!edit} value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} hint="Comma separated" />
          <Input label="Profile photo URL" disabled={!edit} value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!edit} checked={form.teleconsultationAvailable} onChange={(e) => setForm({ ...form, teleconsultationAvailable: e.target.checked })} />
            Teleconsultation availability (video visits remain coming soon)
          </label>
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
