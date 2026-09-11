import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useUnsaved } from "../../hooks/useUnsaved.js";
import { Badge, Button, Card, Input, Select, Skeleton, TodayBadge } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { WEEKDAYS, flattenBlocks, slotLines, slotsToBlocks } from "../../utils/schedule.js";

const LANGS = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "mr", label: "Marathi" },
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const blankSlot = { day: "1", date: "", start: "09:00", end: "13:00" };
const HOUR_BLANK = DAYS.map((_, day) => ({ day, open: "09:00", close: "17:00", closed: day === 0 }));

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 border-b border-line/80 py-2 last:border-0">
      <span className="text-sm">{label}</span>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Actions({ editing, onEdit, onCancel, saving, saveLabel = "Save" }) {
  if (!editing) {
    return (
      <Button type="button" variant="outline" onClick={onEdit}>
        Edit
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : saveLabel}
      </Button>
      <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const { user, applyUser, applyFacility, applyNetwork, refresh, facilityId, logout, network } = useAuth();
  const toast = useToast();
  const { data, loading, error, errorStatus, reload } = useApi("/api/settings");
  const members = useApi(user?.role === "FACILITY_ADMIN" ? "/api/doctors" : "");
  const [dirty, setDirty] = useState(false);
  useUnsaved(dirty);

  const [profile, setProfile] = useState({ name: "", photoUrl: "", preferredLanguage: "en", timezone: "Asia/Kolkata", dateFormat: "DD/MM/YYYY", timeFormat: "12h" });
  const [profileEdit, setProfileEdit] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: "", currentPassword: "", code: "", stage: "idle" });
  const [phoneForm, setPhoneForm] = useState({ phone: "", currentPassword: "" });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [prefs, setPrefs] = useState({});
  const [prefEdit, setPrefEdit] = useState(false);
  const [doc, setDoc] = useState({ specialization: "", qualification: "", registrationNumber: "", experienceYears: 0, languages: "", teleconsultationAvailable: false });
  const [docEdit, setDocEdit] = useState(false);
  const [today, setToday] = useState(false);
  const [slots, setSlots] = useState([blankSlot]);
  const [schedEdit, setSchedEdit] = useState(false);
  const [fac, setFac] = useState({});
  const [facEdit, setFacEdit] = useState(false);
  const [hours, setHours] = useState(HOUR_BLANK);
  const [facPrefs, setFacPrefs] = useState({ appointments: true, referrals: true, email: true, timezone: "Asia/Kolkata", dateFormat: "DD/MM/YYYY", appointmentSlotMinutes: 15 });
  const [networkName, setNetworkName] = useState("");
  const [networkEdit, setNetworkEdit] = useState(false);
  const [saving, setSaving] = useState("");

  const anyEdit =
    profileEdit ||
    prefEdit ||
    docEdit ||
    schedEdit ||
    facEdit ||
    networkEdit ||
    emailForm.stage !== "idle" ||
    !!pw.currentPassword ||
    !!pw.newPassword ||
    !!phoneForm.currentPassword;

  useEffect(() => {
    if (!data?.user) return;
    const u = data.user;
    setProfile({
      name: u.name || "",
      photoUrl: u.photoUrl || "",
      preferredLanguage: u.preferredLanguage || "en",
      timezone: u.timezone || "Asia/Kolkata",
      dateFormat: u.dateFormat || "DD/MM/YYYY",
      timeFormat: u.timeFormat || "12h",
    });
    setEmailForm((p) => ({ ...p, email: u.email || "" }));
    setPhoneForm((p) => ({ ...p, phone: u.phone || "" }));
    setPrefs(u.notificationPrefs || {});
    if (data.doctorProfile) {
      const p = data.doctorProfile;
      setDoc({
        specialization: p.specialization || "",
        qualification: p.qualification || "",
        registrationNumber: p.registrationNumber || "",
        experienceYears: p.experienceYears || 0,
        languages: (p.languages || []).join(", "),
        teleconsultationAvailable: !!p.teleconsultationAvailable,
        photoUrl: p.photoUrl || "",
      });
    }
    if (typeof data.todayActive === "boolean") setToday(data.todayActive);
    if (data.schedule) setSlots(flattenBlocks(data.schedule.blocks));
    if (data.facility) {
      const f = data.facility;
      setFac({
        name: f.name || "",
        type: f.type || "CLINIC",
        legalName: f.legalName || "",
        licenceNumber: f.licenceNumber || "",
        licenceAuthority: f.licenceAuthority || "",
        licenceIssuedAt: f.licenceIssuedAt ? String(f.licenceIssuedAt).slice(0, 10) : "",
        licenceExpiresAt: f.licenceExpiresAt ? String(f.licenceExpiresAt).slice(0, 10) : "",
        accreditation: f.accreditation || "",
        adminDesignation: f.adminDesignation || "",
        responsibleName: f.responsibleProfessional?.name || "",
        responsibleDesignation: f.responsibleProfessional?.designation || "",
        responsibleReg: f.responsibleProfessional?.registrationNumber || "",
        contactNumber: f.contactNumber || "",
        officialEmail: f.officialEmail || "",
        address: f.address || "",
        city: f.city || "",
        district: f.district || "",
        state: f.state || "",
        country: f.country || "India",
        pin: f.pin || "",
        website: f.website || "",
        logoUrl: f.logoUrl || "",
        description: f.description || "",
        deliveryAvailable: !!f.deliveryAvailable,
        pickupAvailable: f.pickupAvailable !== false,
      });
      setHours(f.operatingHours?.length ? DAYS.map((_, day) => f.operatingHours.find((h) => h.day === day) || { day, open: "09:00", close: "17:00", closed: true }) : HOUR_BLANK);
      setFacPrefs({
        timezone: f.timezone || "Asia/Kolkata",
        dateFormat: f.dateFormat || "DD/MM/YYYY",
        appointmentSlotMinutes: f.appointmentSlotMinutes || 15,
        appointments: f.notificationPrefs?.appointments !== false,
        referrals: f.notificationPrefs?.referrals !== false,
        email: f.notificationPrefs?.email !== false,
      });
    }
    if (data.network?.name) setNetworkName(data.network.name);
  }, [data]);

  useEffect(() => {
    if (!networkEdit && network?.name) setNetworkName(network.name);
  }, [network, networkEdit]);

  useEffect(() => {
    setDirty(anyEdit);
  }, [anyEdit]);

  useEffect(() => {
    setProfileEdit(false);
    setPrefEdit(false);
    setDocEdit(false);
    setSchedEdit(false);
    setFacEdit(false);
    setNetworkEdit(false);
  }, [facilityId]);

  async function run(key, fn) {
    setSaving(key);
    try {
      const res = await fn();
      toast(res.message || "Settings saved successfully.");
      if (res.user) applyUser(res.user);
      if (res.facility) applyFacility(res.facility);
      if (res.network) applyNetwork(res.network);
      await refresh();
      await reload({ silent: true });
      return res;
    } catch (err) {
      toast(err.message || "Could not save settings.", "danger");
      return null;
    } finally {
      setSaving("");
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    if (!profile.name.trim()) return toast("Enter your full name.", "danger");
    const res = await run("profile", () => api("/api/settings/profile", { method: "PATCH", body: profile }));
    if (res) setProfileEdit(false);
  }

  async function requestEmail(e) {
    e.preventDefault();
    const res = await run("email", () =>
      api("/api/settings/email/request", {
        method: "POST",
        body: { email: emailForm.email, currentPassword: emailForm.currentPassword },
      })
    );
    if (res) setEmailForm((p) => ({ ...p, stage: "code", currentPassword: "" }));
  }

  async function confirmEmail(e) {
    e.preventDefault();
    const res = await run("email", () => api("/api/settings/email/confirm", { method: "POST", body: { email: emailForm.email, code: emailForm.code } }));
    if (res) setEmailForm((p) => ({ ...p, stage: "idle", code: "", currentPassword: "" }));
  }

  async function savePhone(e) {
    e.preventDefault();
    const res = await run("phone", () => api("/api/settings/phone", { method: "PATCH", body: phoneForm }));
    if (res) setPhoneForm((p) => ({ ...p, currentPassword: "" }));
  }

  async function savePassword(e) {
    e.preventDefault();
    if (pw.newPassword !== pw.confirmPassword) return toast("New password and confirmation do not match.", "danger");
    if (pw.newPassword.length < 8) return toast("New password must be at least 8 characters.", "danger");
    const res = await run("password", () => api("/api/settings/password", { method: "POST", body: pw }));
    if (res) setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
  }

  async function savePrefs(e) {
    e.preventDefault();
    const res = await run("prefs", () => api("/api/settings/notifications", { method: "PATCH", body: prefs }));
    if (res) setPrefEdit(false);
  }

  async function saveDoctor(e) {
    e.preventDefault();
    const res = await run("doctor", () =>
      api("/api/doctors/profile/me", {
        method: "PATCH",
        body: {
          ...doc,
          experienceYears: Number(doc.experienceYears),
          languages: doc.languages.split(",").map((s) => s.trim()).filter(Boolean),
          name: profile.name,
        },
      })
    );
    if (res) setDocEdit(false);
  }

  async function setTodayStatus(active) {
    const res = await run("today", () => api("/api/doctors/today-status", { method: "PATCH", facilityId, body: { active } }));
    if (res) setToday(active);
  }

  async function saveSchedule(e) {
    e.preventDefault();
    const res = await run("schedule", () =>
      api("/api/doctors/schedule", { method: "PUT", facilityId, body: { blocks: slotsToBlocks(slots), unavailableDates: data?.schedule?.unavailableDates || [] } })
    );
    if (res) setSchedEdit(false);
  }

  async function saveFacility(e) {
    e.preventDefault();
    const name = String(fac.name || "").trim();
    if (name.length < 2) return toast("Facility name cannot be empty.", "danger");
    const res = await run("facility", () =>
      api("/api/facilities/me", {
        method: "PATCH",
        facilityId,
          body: {
            ...fac,
            name,
            licenceIssuedAt: fac.licenceIssuedAt || undefined,
            licenceExpiresAt: fac.licenceExpiresAt || undefined,
            responsibleProfessional: {
              name: fac.responsibleName,
              designation: fac.responsibleDesignation,
              registrationNumber: fac.responsibleReg,
            },
          operatingHours: hours,
          timezone: facPrefs.timezone,
          dateFormat: facPrefs.dateFormat,
          appointmentSlotMinutes: Number(facPrefs.appointmentSlotMinutes),
          notificationPrefs: { appointments: facPrefs.appointments, referrals: facPrefs.referrals, email: facPrefs.email },
        },
      })
    );
    if (res) setFacEdit(false);
  }

  async function saveNetwork(e) {
    e.preventDefault();
    const name = String(networkName || "").trim();
    if (name.length < 2) return toast("Network name cannot be empty.", "danger");
    const res = await run("network", () => api("/api/settings/network", { method: "PATCH", body: { name } }));
    if (res) {
      setNetworkName(res.network?.name || name);
      setNetworkEdit(false);
    }
  }

  async function setAccess(doctorUserId, status) {
    const res = await run("access", () => api(`/api/doctors/${doctorUserId}/access`, { method: "PATCH", facilityId, body: { status } }));
    if (res) members.reload?.();
  }

  if (errorStatus === 401) return <Navigate to="/login" replace />;
  if (loading) return <Skeleton className="h-40" />;
  if (errorStatus === 403) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-red-50 p-6">
        <p className="font-semibold text-danger">Not authorized</p>
        <p className="mt-1 text-sm text-ink-soft">You do not have permission to view these settings.</p>
      </div>
    );
  }
  if (errorStatus === 404) {
    return (
      <div className="rounded-2xl border border-line p-6">
        <p className="font-semibold">Settings are unavailable</p>
        <p className="mt-1 text-sm text-ink-soft">{error}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-red-50 p-6">
        <p className="text-danger">Unable to load settings.</p>
        <p className="mt-1 text-sm text-ink-soft">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => reload()}>
          Retry
        </Button>
      </div>
    );
  }

  const role = user?.role;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">{role === "MAIN_ADMIN" ? "System settings" : "Settings"}</h1>
        <p className="text-ink-soft">Changes are saved to your account and apply after a successful save.</p>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Profile</h2>
            <p className="text-sm text-ink-soft">Your name is used in the header, dashboards, appointments, queue, and clinical records.</p>
          </div>
        </div>
        <form className="space-y-3" onSubmit={saveProfile}>
          <Input label="Full name" disabled={!profileEdit} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          <Input label="Profile photo URL" disabled={!profileEdit} value={profile.photoUrl} onChange={(e) => setProfile({ ...profile, photoUrl: e.target.value })} hint="Paste an image URL. File upload is not enabled in this build." />
          <Select label="Preferred language" disabled={!profileEdit} value={profile.preferredLanguage} onChange={(e) => setProfile({ ...profile, preferredLanguage: e.target.value })}>
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
          <Input label="Time zone" disabled={!profileEdit} value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} />
          <Select label="Date format" disabled={!profileEdit} value={profile.dateFormat} onChange={(e) => setProfile({ ...profile, dateFormat: e.target.value })}>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          </Select>
          <Select label="Time format" disabled={!profileEdit} value={profile.timeFormat} onChange={(e) => setProfile({ ...profile, timeFormat: e.target.value })}>
            <option value="12h">12-hour</option>
            <option value="24h">24-hour</option>
          </Select>
          <Actions
            editing={profileEdit}
            saving={saving === "profile"}
            onEdit={() => setProfileEdit(true)}
            onCancel={() => {
              setProfileEdit(false);
              reload({ silent: true });
            }}
          />
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-2xl">Email & phone</h2>
        <p className="mt-1 text-sm text-ink-soft">Email is your sign-in identity. Changing it requires your current password and a code sent to the new address.</p>
        <form className="mt-4 space-y-3" onSubmit={emailForm.stage === "code" ? confirmEmail : requestEmail}>
          <Input label="Email" type="email" required value={emailForm.email} onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value, stage: emailForm.stage === "code" ? "code" : "edit" })} />
          {emailForm.stage !== "code" && (
            <Input label="Current password" type="password" value={emailForm.currentPassword} onChange={(e) => setEmailForm({ ...emailForm, currentPassword: e.target.value })} />
          )}
          {emailForm.stage === "code" && (
            <Input label="Verification code" value={emailForm.code} onChange={(e) => setEmailForm({ ...emailForm, code: e.target.value })} hint="Sent to the new email (and the development outbox)." />
          )}
          <Button type="submit" disabled={saving === "email"}>
            {saving === "email" ? "Saving..." : emailForm.stage === "code" ? "Confirm email" : "Change email"}
          </Button>
        </form>
        <form className="mt-6 space-y-3" onSubmit={savePhone}>
          <Input label="Phone" value={phoneForm.phone} onChange={(e) => setPhoneForm({ ...phoneForm, phone: e.target.value })} />
          <Input label="Current password" type="password" value={phoneForm.currentPassword} onChange={(e) => setPhoneForm({ ...phoneForm, currentPassword: e.target.value })} />
          <Button type="submit" disabled={saving === "phone"}>
            {saving === "phone" ? "Saving..." : "Save phone"}
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-2xl">Password & security</h2>
        <form className="mt-4 space-y-3" onSubmit={savePassword}>
          <Input label="Current password" type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          <Input label="New password" type="password" required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} hint="At least 8 characters." />
          <Input label="Confirm new password" type="password" required value={pw.confirmPassword} onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })} />
          <Button type="submit" disabled={saving === "password"}>
            {saving === "password" ? "Saving..." : "Change password"}
          </Button>
        </form>
        <div className="mt-6 space-y-2 text-sm text-ink-soft">
          <p>Role: {role?.replaceAll("_", " ")} (cannot be changed here)</p>
          <p>Last sign-in: {data.session?.lastLoginAt ? new Date(data.session.lastLoginAt).toLocaleString() : "—"}</p>
          <p>Account created: {data.session?.createdAt ? new Date(data.session.createdAt).toLocaleString() : "—"}</p>
        </div>
        <Button
          className="mt-4"
          variant="outline"
          onClick={async () => {
            await logout();
            window.location.href = "/login";
          }}
        >
          Sign out of this session
        </Button>
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-2xl">Notifications</h2>
        <p className="mt-1 text-sm text-ink-soft">These control in-app notices and non-security email. Sign-in codes and password reset emails are always sent.</p>
        <form className="mt-4" onSubmit={savePrefs}>
          <fieldset disabled={!prefEdit}>
            <Toggle label="Appointment notifications" checked={prefs.appointments !== false} onChange={(v) => setPrefs({ ...prefs, appointments: v })} />
            <Toggle label="Referral notifications" checked={prefs.referrals !== false} onChange={(v) => setPrefs({ ...prefs, referrals: v })} />
            <Toggle label="System / security notifications" checked={prefs.system !== false} onChange={(v) => setPrefs({ ...prefs, system: v })} />
            <Toggle label="Email notifications" checked={prefs.email !== false} onChange={(v) => setPrefs({ ...prefs, email: v })} />
            <Toggle label="In-app notifications" checked={prefs.inApp !== false} onChange={(v) => setPrefs({ ...prefs, inApp: v })} />
          </fieldset>
          <div className="mt-4">
            <Actions
              editing={prefEdit}
              saving={saving === "prefs"}
              onEdit={() => setPrefEdit(true)}
              onCancel={() => {
                setPrefEdit(false);
                reload({ silent: true });
              }}
            />
          </div>
        </form>
      </Card>

      {role === "DOCTOR" && (
        <>
          <Card className="p-5">
            <h2 className="font-display text-2xl">Professional profile</h2>
            <form className="mt-4 space-y-3" onSubmit={saveDoctor}>
              <Input label="Specialization" disabled={!docEdit} value={doc.specialization} onChange={(e) => setDoc({ ...doc, specialization: e.target.value })} />
              <Input label="Qualification" disabled={!docEdit} value={doc.qualification} onChange={(e) => setDoc({ ...doc, qualification: e.target.value })} />
              <Input label="Registration number" disabled={!docEdit} value={doc.registrationNumber} onChange={(e) => setDoc({ ...doc, registrationNumber: e.target.value })} />
              <Input label="Experience (years)" type="number" disabled={!docEdit} value={doc.experienceYears} onChange={(e) => setDoc({ ...doc, experienceYears: e.target.value })} />
              <Input label="Languages" disabled={!docEdit} value={doc.languages} onChange={(e) => setDoc({ ...doc, languages: e.target.value })} hint="Comma separated" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!docEdit} checked={!!doc.teleconsultationAvailable} onChange={(e) => setDoc({ ...doc, teleconsultationAvailable: e.target.checked })} />
                Teleconsultation available (video visits remain coming soon)
              </label>
              <p className="text-xs text-ink-soft">Credential verification cannot be changed from this screen.</p>
              <Actions
                editing={docEdit}
                saving={saving === "doctor"}
                onEdit={() => setDocEdit(true)}
                onCancel={() => {
                  setDocEdit(false);
                  reload({ silent: true });
                }}
              />
            </form>
          </Card>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">Availability</h2>
                <p className="text-sm text-ink-soft">Today Active/Inactive is for this facility only. It is not account access.</p>
              </div>
              <TodayBadge active={today} />
            </div>
            <div className="mt-3 inline-flex rounded-xl border border-line p-1">
              <button type="button" disabled={saving === "today"} className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${today ? "bg-teal-900 text-white" : "text-ink-soft"}`} onClick={() => setTodayStatus(true)}>
                Active
              </button>
              <button type="button" disabled={saving === "today"} className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${!today ? "bg-teal-900 text-white" : "text-ink-soft"}`} onClick={() => setTodayStatus(false)}>
                Inactive
              </button>
            </div>
            <form className="mt-5 space-y-3" onSubmit={saveSchedule}>
              <p className="text-sm font-medium">Working schedule for the selected facility</p>
              {!schedEdit && (
                <ul className="text-sm">
                  {slotLines(slotsToBlocks(slots)).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                  {!slotLines(slotsToBlocks(slots)).length && <li className="text-ink-soft">No slots saved yet.</li>}
                </ul>
              )}
              {schedEdit &&
                slots.map((s, i) => (
                  <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">
                    <Select label="Day" value={s.day} onChange={(e) => setSlots(slots.map((x, n) => (n === i ? { ...x, day: e.target.value } : x)))}>
                      {WEEKDAYS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </Select>
                    <Input label="Specific date (optional)" type="date" value={s.date} onChange={(e) => setSlots(slots.map((x, n) => (n === i ? { ...x, date: e.target.value } : x)))} />
                    <Input label="Start" type="time" value={s.start} onChange={(e) => setSlots(slots.map((x, n) => (n === i ? { ...x, start: e.target.value } : x)))} />
                    <Input label="End" type="time" value={s.end} onChange={(e) => setSlots(slots.map((x, n) => (n === i ? { ...x, end: e.target.value } : x)))} />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        const next = slots.filter((_, n) => n !== i);
                        setSlots(next.length ? next : [{ ...blankSlot }]);
                      }}
                    >
                      Remove slot
                    </Button>
                  </div>
                ))}
              {schedEdit && (
                <Button type="button" variant="outline" onClick={() => setSlots([...slots, { ...blankSlot }])}>
                  + Add time slot
                </Button>
              )}
              <Actions
                editing={schedEdit}
                saving={saving === "schedule"}
                onEdit={() => setSchedEdit(true)}
                onCancel={() => {
                  setSchedEdit(false);
                  reload({ silent: true });
                }}
              />
            </form>
          </Card>
        </>
      )}

      {role === "FACILITY_ADMIN" && (
        <>
          <Card className="p-5" id="facility">
            <h2 className="font-display text-2xl">Facility profile</h2>
            <p className="mt-1 text-sm text-ink-soft">Verification status cannot be changed here.</p>
            {data.facility?.status && (
              <p className="mt-2">
                <Badge tone={data.facility.status === "VERIFIED" ? "ok" : "warn"}>{data.facility.status.replaceAll("_", " ")}</Badge>
              </p>
            )}
            <form className="mt-4 space-y-3" onSubmit={saveFacility}>
              <Input
                label="Facility name"
                disabled={!facEdit}
                maxLength={120}
                value={fac.name || ""}
                onChange={(e) => setFac({ ...fac, name: e.target.value })}
              />
              <Select label="Facility type" disabled={!facEdit} value={fac.type || "CLINIC"} onChange={(e) => setFac({ ...fac, type: e.target.value })}>
                <option value="HOSPITAL">Hospital</option>
                <option value="CLINIC">Clinic</option>
                <option value="NURSING_HOME">Nursing Home</option>
                <option value="DIAGNOSTIC_CENTRE">Diagnostic Center</option>
                <option value="LABORATORY">Laboratory</option>
                <option value="PHARMACY">Pharmacy</option>
                <option value="MEDICINE_SHOP">Medicine Shop</option>
              </Select>
              <Input label="Legal / registered name" disabled={!facEdit} value={fac.legalName || ""} onChange={(e) => setFac({ ...fac, legalName: e.target.value })} />
              <Input label="Licence / registration number" disabled={!facEdit} value={fac.licenceNumber || ""} onChange={(e) => setFac({ ...fac, licenceNumber: e.target.value })} />
              <Input label="Licence / registration authority" disabled={!facEdit} value={fac.licenceAuthority || ""} onChange={(e) => setFac({ ...fac, licenceAuthority: e.target.value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Licence issue date" type="date" disabled={!facEdit} value={fac.licenceIssuedAt || ""} onChange={(e) => setFac({ ...fac, licenceIssuedAt: e.target.value })} />
                <Input label="Licence expiry date" type="date" disabled={!facEdit} value={fac.licenceExpiresAt || ""} onChange={(e) => setFac({ ...fac, licenceExpiresAt: e.target.value })} />
              </div>
              <Input label="Accreditation" disabled={!facEdit} value={fac.accreditation || ""} onChange={(e) => setFac({ ...fac, accreditation: e.target.value })} />
              <Input label="Responsible professional" disabled={!facEdit} value={fac.responsibleName || ""} onChange={(e) => setFac({ ...fac, responsibleName: e.target.value })} />
              <Input label="Professional designation" disabled={!facEdit} value={fac.responsibleDesignation || ""} onChange={(e) => setFac({ ...fac, responsibleDesignation: e.target.value })} />
              <Input label="Professional registration no." disabled={!facEdit} value={fac.responsibleReg || ""} onChange={(e) => setFac({ ...fac, responsibleReg: e.target.value })} />
              <Input label="Phone" disabled={!facEdit} value={fac.contactNumber || ""} onChange={(e) => setFac({ ...fac, contactNumber: e.target.value })} />
              <Input label="Official email" type="email" disabled={!facEdit} value={fac.officialEmail || ""} onChange={(e) => setFac({ ...fac, officialEmail: e.target.value })} />
              <Input label="Address" disabled={!facEdit} value={fac.address || ""} onChange={(e) => setFac({ ...fac, address: e.target.value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="City" disabled={!facEdit} value={fac.city || ""} onChange={(e) => setFac({ ...fac, city: e.target.value })} />
                <Input label="District" disabled={!facEdit} value={fac.district || ""} onChange={(e) => setFac({ ...fac, district: e.target.value })} />
                <Input label="State" disabled={!facEdit} value={fac.state || ""} onChange={(e) => setFac({ ...fac, state: e.target.value })} />
                <Input label="Country" disabled={!facEdit} value={fac.country || ""} onChange={(e) => setFac({ ...fac, country: e.target.value })} />
                <Input label="Postal / PIN" disabled={!facEdit} value={fac.pin || ""} onChange={(e) => setFac({ ...fac, pin: e.target.value })} />
              </div>
              <Input label="Website" disabled={!facEdit} value={fac.website || ""} onChange={(e) => setFac({ ...fac, website: e.target.value })} />
              <Input label="Logo URL" disabled={!facEdit} value={fac.logoUrl || ""} onChange={(e) => setFac({ ...fac, logoUrl: e.target.value })} />
              <Input label="Description" disabled={!facEdit} value={fac.description || ""} onChange={(e) => setFac({ ...fac, description: e.target.value })} />
              {(fac.type === "PHARMACY" || fac.type === "MEDICINE_SHOP") && (
                <>
                  <Toggle label="Delivery available for facility orders" checked={!!fac.deliveryAvailable} disabled={!facEdit} onChange={(v) => setFac({ ...fac, deliveryAvailable: v })} />
                  <Toggle label="Pickup available" checked={fac.pickupAvailable !== false} disabled={!facEdit} onChange={(v) => setFac({ ...fac, pickupAvailable: v })} />
                </>
              )}
              <p className="pt-2 text-sm font-medium">Working hours</p>
              {hours.map((h) => (
                <div key={h.day} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
                  <span className="text-sm">{DAYS[h.day]}</span>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" disabled={!facEdit} checked={!h.closed} onChange={(e) => setHours(hours.map((x) => (x.day === h.day ? { ...x, closed: !e.target.checked } : x)))} />
                    Open
                  </label>
                  <Input type="time" disabled={!facEdit || h.closed} value={h.open || "09:00"} onChange={(e) => setHours(hours.map((x) => (x.day === h.day ? { ...x, open: e.target.value } : x)))} />
                  <Input type="time" disabled={!facEdit || h.closed} value={h.close || "17:00"} onChange={(e) => setHours(hours.map((x) => (x.day === h.day ? { ...x, close: e.target.value } : x)))} />
                </div>
              ))}
              <Input label="Default appointment length (minutes)" type="number" disabled={!facEdit} value={facPrefs.appointmentSlotMinutes} onChange={(e) => setFacPrefs({ ...facPrefs, appointmentSlotMinutes: e.target.value })} />
              <Input label="Facility time zone" disabled={!facEdit} value={facPrefs.timezone} onChange={(e) => setFacPrefs({ ...facPrefs, timezone: e.target.value })} />
              <Select label="Facility date format" disabled={!facEdit} value={facPrefs.dateFormat} onChange={(e) => setFacPrefs({ ...facPrefs, dateFormat: e.target.value })}>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </Select>
              <Toggle label="Facility appointment emails" checked={facPrefs.appointments} disabled={!facEdit} onChange={(v) => setFacPrefs({ ...facPrefs, appointments: v })} />
              <Toggle label="Facility referral emails" checked={facPrefs.referrals} disabled={!facEdit} onChange={(v) => setFacPrefs({ ...facPrefs, referrals: v })} />
              <Toggle label="Facility email channel" checked={facPrefs.email} disabled={!facEdit} onChange={(v) => setFacPrefs({ ...facPrefs, email: v })} />
              <Actions
                editing={facEdit}
                saving={saving === "facility"}
                onEdit={() => setFacEdit(true)}
                onCancel={() => {
                  setFacEdit(false);
                  reload({ silent: true });
                }}
              />
            </form>
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-2xl">Doctors at this facility</h2>
            <p className="mt-1 text-sm text-ink-soft">Access Active/Inactive is facility membership, not Today availability. Schedules stay on the Doctors page.</p>
            <ul className="mt-4 space-y-3">
              {(members.data?.doctors || []).map((d) => (
                <li key={d._id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
                  <span>
                    {d.userId?.name} · {d.doctorProfileId?.specialization}
                    <span className="ml-2 text-ink-soft">{d.status}</span>
                    <TodayBadge active={!!d.todayActive} />
                  </span>
                  <span className="flex gap-2">
                    {d.status === "ACTIVE" ? (
                      <Button variant="outline" onClick={() => setAccess(d.userId?._id || d.userId, "INACTIVE")}>
                        Deactivate access
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => setAccess(d.userId?._id || d.userId, "ACTIVE")}>
                        Activate access
                      </Button>
                    )}
                    <Link className="rounded-xl border border-line px-3 py-2 text-sm font-semibold" to="/app/doctors">
                      Schedule
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {role === "MAIN_ADMIN" && (
        <Card className="p-5">
          <h2 className="font-display text-2xl">Network controls</h2>
          <p className="mt-2 text-sm text-ink-soft">
            The network name appears on the command center, network overview, and header. JWT secrets, SMTP and MongoDB stay in
            server environment variables.
          </p>
          <form className="mt-4 max-w-md space-y-3" onSubmit={saveNetwork}>
            <Input
              label="Network / organization name"
              disabled={!networkEdit}
              maxLength={120}
              value={networkName}
              onChange={(e) => setNetworkName(e.target.value)}
            />
            <Actions
              editing={networkEdit}
              saving={saving === "network"}
              onEdit={() => setNetworkEdit(true)}
              onCancel={() => {
                setNetworkEdit(false);
                setNetworkName(data.network?.name || networkName);
                reload({ silent: true });
              }}
            />
          </form>
          <ul className="mt-4 space-y-1 text-sm">
            <li>App time zone: {data.system?.timezone}</li>
            <li>Environment: {data.system?.node}</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="rounded-xl border border-line px-4 py-2 text-sm font-semibold" to="/app/verification">
              Facility verification
            </Link>
            <Link className="rounded-xl border border-line px-4 py-2 text-sm font-semibold" to="/app/network-doctors">
              Doctor network
            </Link>
            <Link className="rounded-xl border border-line px-4 py-2 text-sm font-semibold" to="/app/audit">
              Audit logs
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
