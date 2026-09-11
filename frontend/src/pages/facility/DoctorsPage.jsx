import { useState } from "react";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Table, Timeline, TodayBadge } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { WEEKDAYS, flattenBlocks, slotLines, slotsToBlocks } from "../../utils/schedule.js";

const INVITE_STEPS = ["SENT", "OPENED", "ACCEPTED"];
const blankSlot = { day: "1", date: "", start: "09:00", end: "13:00" };

export default function DoctorsPage() {
  const { data, reload, facilityId, error } = useApi("/api/doctors");
  const facility = useApi("/api/facilities/me");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [demoLink, setDemoLink] = useState("");
  const [editor, setEditor] = useState(null);
  const [slots, setSlots] = useState([blankSlot]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    registrationNumber: "",
    specialization: "General Medicine",
    qualification: "MBBS",
    departmentId: "",
    experienceYears: 5,
    start: "09:00",
    end: "14:00",
  });

  async function invite(e) {
    e.preventDefault();
    try {
      const res = await api("/api/doctors/invite", {
        method: "POST",
        facilityId,
        body: {
          ...form,
          experienceYears: Number(form.experienceYears),
          consultationSchedule: { days: [1, 2, 3, 4, 5], start: form.start, end: form.end, durationMinutes: 15 },
        },
      });
      toast(res.message);
      setDemoLink(res.demoLink || "");
      setOpen(false);
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  function openSchedule(row) {
    setEditor(row);
    setSlots(flattenBlocks(row.schedule?.blocks));
  }

  async function saveSchedule(e) {
    e.preventDefault();
    const doctorUserId = editor?.userId?._id || editor?.userId;
    setSavingSchedule(true);
    try {
      await api(`/api/doctors/${doctorUserId}/schedule`, {
        method: "PUT",
        facilityId,
        body: { blocks: slotsToBlocks(slots), unavailableDates: editor?.schedule?.unavailableDates || [] },
      });
      toast("Schedule saved for this facility.");
      setEditor(null);
      reload();
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function clearSchedule(row) {
    const doctorUserId = row.userId?._id || row.userId;
    try {
      await api(`/api/doctors/${doctorUserId}/schedule`, {
        method: "PUT",
        facilityId,
        body: { blocks: [], unavailableDates: [] },
      });
      toast("Schedule removed for this facility.");
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (error) return <p className="text-danger">{error}</p>;

  const linked = (data?.doctors || []).filter((d) => d.status === "ACTIVE");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Doctors</h1>
          <p className="text-ink-soft">Invite by professional details. You cannot set a doctor’s password from here.</p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Invite doctor</Button>
      </div>
      {demoLink && (
        <Card className="p-4 text-sm">
          <p className="font-semibold">Development invitation link</p>
          <p className="mt-1 break-all text-teal-800">{demoLink}</p>
          <p className="mt-2 text-ink-soft">In production this is emailed only. Open it to complete OTP activation.</p>
        </Card>
      )}
      <Table
        columns={[
          { key: "name", label: "Doctor", render: (r) => r.userId?.name },
          { key: "spec", label: "Specialization", render: (r) => r.doctorProfileId?.specialization },
          { key: "dept", label: "Department", render: (r) => r.departmentId?.name || "—" },
          { key: "today", label: "Today", render: (r) => <TodayBadge active={!!r.todayActive} /> },
          {
            key: "v",
            label: "Credentials",
            render: (r) => (r.doctorProfileId?.credentialsVerified ? <Badge tone="ok">✓ Verified</Badge> : <Badge tone="warn">Pending</Badge>),
          },
          { key: "status", label: "Link", render: (r) => statusLabel(r.status) },
          {
            key: "access",
            label: "Access",
            render: (r) => (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await api(`/api/doctors/${r.userId?._id || r.userId}/access`, {
                      method: "PATCH",
                      facilityId,
                      body: { status: r.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
                    });
                    toast("Settings saved successfully.");
                    reload();
                  } catch (err) {
                    toast(err.message, "danger");
                  }
                }}
              >
                {r.status === "ACTIVE" ? "Deactivate access" : "Activate access"}
              </Button>
            ),
          },
        ]}
        rows={data?.doctors || []}
        empty={<EmptyState title="No doctors added yet" body="Send a secure invitation. The doctor must accept before seeing patients." action={<Button onClick={() => setOpen(true)}>+ Add doctor</Button>} />}
      />
      <div>
        <h2 className="font-display text-2xl">Doctor availability</h2>
        <p className="mt-1 text-sm text-ink-soft">Working hours for this facility only. Today Active/Inactive is set by the doctor and is not the same as account verification.</p>
        <div className="mt-4 space-y-3">
          {linked.map((d) => {
            const lines = slotLines(d.schedule?.blocks);
            return (
              <Card key={d._id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{d.userId?.name}</p>
                    <p className="text-sm text-ink-soft">{d.doctorProfileId?.specialization || "—"}</p>
                  </div>
                  <TodayBadge active={!!d.todayActive} />
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {lines.length ? lines.map((line) => <li key={line}>{line}</li>) : <li className="text-ink-soft">No schedule set for this facility.</li>}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => openSchedule(d)}>
                    {d.schedule?.blocks?.length ? "Edit schedule" : "Add schedule"}
                  </Button>
                  {d.schedule?.blocks?.length ? (
                    <Button variant="ghost" onClick={() => clearSchedule(d)}>
                      Remove schedule
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
          {!linked.length && <p className="text-sm text-ink-soft">No linked doctors yet.</p>}
        </div>
      </div>
      <div>
        <h2 className="font-display text-2xl">Invitations</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(data?.invitations || []).map((inv) => (
            <Card key={inv._id} className="p-5">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-semibold">{inv.name}</p>
                  <p className="text-xs text-ink-soft">{inv.email}</p>
                </div>
                <Badge tone={inv.status === "ACCEPTED" ? "ok" : "warn"}>{inv.status}</Badge>
              </div>
              <div className="mt-4">
                <Timeline
                  steps={INVITE_STEPS.map((s) => ({
                    title: s,
                    meta: s === inv.status ? "Current" : "",
                    done: INVITE_STEPS.indexOf(s) <= INVITE_STEPS.indexOf(inv.status) || inv.status === "ACCEPTED",
                  }))}
                />
              </div>
            </Card>
          ))}
        </div>
        {!data?.invitations?.length && <p className="mt-3 text-sm text-ink-soft">No invitations yet.</p>}
      </div>
      <Modal open={open} title="Invite doctor" onClose={() => setOpen(false)}>
        <form className="max-h-[70vh] space-y-3 overflow-y-auto pr-1" onSubmit={invite}>
          <Input label="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Mobile" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Medical registration number" required value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
          <Input label="Specialization" required value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
          <Input label="Qualification" required value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} />
          <Select label="Department" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
            <option value="">Select</option>
            {facility.data?.departments?.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Input label="Experience (years)" type="number" value={form.experienceYears} onChange={(e) => setForm({ ...form, experienceYears: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Clinic start" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            <Input label="Clinic end" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </div>
          <Button type="submit">Send invitation</Button>
        </form>
      </Modal>
      <Modal open={!!editor} title={editor ? `Schedule · ${editor.userId?.name}` : "Schedule"} onClose={() => setEditor(null)} className="max-w-2xl">
        <form className="max-h-[70vh] space-y-3 overflow-y-auto pr-1" onSubmit={saveSchedule}>
          {slots.map((s, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">
              <Select label="Day" value={s.day} onChange={(e) => setSlots(slots.map((x, n) => (n === i ? { ...x, day: e.target.value } : x)))}>
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Specific date (optional)"
                type="date"
                value={s.date}
                onChange={(e) => setSlots(slots.map((x, n) => (n === i ? { ...x, date: e.target.value } : x)))}
              />
              <Input label="Start" type="time" required value={s.start} onChange={(e) => setSlots(slots.map((x, n) => (n === i ? { ...x, start: e.target.value } : x)))} />
              <Input label="End" type="time" required value={s.end} onChange={(e) => setSlots(slots.map((x, n) => (n === i ? { ...x, end: e.target.value } : x)))} />
              <div className="sm:col-span-2">
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
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setSlots([...slots, { ...blankSlot }])}>
            + Add time slot
          </Button>
          <Button type="submit" disabled={savingSchedule}>
            Save schedule
          </Button>
        </form>
      </Modal>
    </div>
  );
}
