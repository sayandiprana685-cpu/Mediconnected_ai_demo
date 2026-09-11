import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, downloadBinary } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { Button, Input, Select } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { PrescriptionDocument } from "../../features/prescriptions/PrescriptionDocument.jsx";

const emptyMed = () => ({ name: "", strength: "", dosage: "", frequency: "", duration: "", instructions: "" });

function blankForm() {
  return {
    patientId: "",
    patientSnapshot: { name: "", mrn: "", age: "", sex: "", address: "", date: new Date().toLocaleDateString("en-IN") },
    vitals: { bp: "", temperature: "", pulse: "", weight: "" },
    chiefComplaint: "",
    diagnosis: "",
    clinicalNotes: "",
    medicines: [emptyMed()],
    investigations: [{ name: "", advised: true }],
    adviceItems: [""],
    followUpDate: "",
    substitutionAllowed: null,
  };
}

export default function PrescriptionEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const { user, facilityId } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const patients = usePatients(facilityId);
  const [letterheadPack, setLetterheadPack] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [status, setStatus] = useState("DRAFT");
  const [rxId, setRxId] = useState(id || null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const isDoctor = user?.role === "DOCTOR";
  const locked = status !== "DRAFT";

  useEffect(() => {
    if (isDoctor) {
      api("/api/prescriptions/letterhead", { facilityId }).then(setLetterheadPack).catch(() => {});
    }
  }, [facilityId, isDoctor]);

  useEffect(() => {
    if (!id) return;
    api(`/api/prescriptions/${id}`, { facilityId })
      .then((res) => {
        const rx = res.prescription;
        setRxId(rx._id);
        setStatus(rx.status);
        setForm({
          patientId: rx.patientId?._id || rx.patientId,
          patientSnapshot: { name: "", mrn: "", age: "", sex: "", address: "", date: "", ...rx.patientSnapshot },
          vitals: { bp: "", temperature: "", pulse: "", weight: "", ...rx.vitals },
          chiefComplaint: rx.chiefComplaint || "",
          diagnosis: rx.diagnosis || "",
          clinicalNotes: rx.clinicalNotes || "",
          medicines: (() => {
            const meds = rx.medicines?.length
              ? rx.medicines
              : (rx.items || []).map((i) => ({
                  name: i.medicine,
                  strength: i.dose,
                  dosage: "",
                  frequency: i.frequency,
                  duration: i.duration,
                  instructions: i.instructions || "",
                }));
            return meds.length ? meds : [emptyMed()];
          })(),
          investigations: rx.investigations?.length ? rx.investigations : [{ name: "", advised: true }],
          adviceItems: rx.adviceItems?.length ? rx.adviceItems : rx.advice ? [rx.advice] : [""],
          followUpDate: rx.followUpDate ? String(rx.followUpDate).slice(0, 10) : "",
          substitutionAllowed: rx.substitutionAllowed,
        });
        if (rx.letterhead) setLetterheadPack({ letterhead: rx.letterhead, doctorSnapshot: rx.doctorSnapshot });
      })
      .catch((e) => toast(e.message, "danger"));
  }, [id, facilityId]);

  const liveDoc = useMemo(() => {
    const pack = letterheadPack || { letterhead: {}, doctorSnapshot: {} };
    return {
      letterhead: pack.letterhead,
      doctor: pack.doctorSnapshot,
      patient: form.patientSnapshot,
      vitals: form.vitals,
      chiefComplaint: form.chiefComplaint,
      diagnosis: form.diagnosis,
      clinicalNotes: form.clinicalNotes,
      medicines: form.medicines,
      investigations: form.investigations.filter((t) => t.name),
      adviceItems: form.adviceItems.filter(Boolean),
      followUpDate: form.followUpDate || null,
      substitutionAllowed: form.substitutionAllowed,
    };
  }, [form, letterheadPack]);

  function payload() {
    return {
      patientId: form.patientId,
      patientSnapshot: form.patientSnapshot,
      vitals: form.vitals,
      chiefComplaint: form.chiefComplaint,
      diagnosis: form.diagnosis,
      clinicalNotes: form.clinicalNotes,
      medicines: form.medicines.filter((m) => m.name),
      investigations: form.investigations.filter((t) => t.name),
      adviceItems: form.adviceItems.filter(Boolean),
      followUpDate: form.followUpDate || null,
      substitutionAllowed: form.substitutionAllowed,
    };
  }

  async function saveDraft() {
    setBusy(true);
    try {
      if (!form.patientId) throw new Error("Select a patient.");
      let res;
      if (!rxId) {
        res = await api("/api/prescriptions", { method: "POST", facilityId, body: payload() });
        setRxId(res.prescription._id);
        navigate(`/app/prescriptions/${res.prescription._id}`, { replace: true });
      } else {
        res = await api(`/api/prescriptions/${rxId}`, { method: "PATCH", facilityId, body: payload() });
      }
      setStatus(res.prescription.status);
      toast("Draft saved.");
      return res.prescription._id;
    } catch (err) {
      toast(err.message, "danger");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    const saved = rxId || (await saveDraft());
    if (!saved) return;
    setBusy(true);
    try {
      const res = await api(`/api/prescriptions/${saved}`, { method: "PATCH", facilityId, body: payload() });
      const fin = await api(`/api/prescriptions/${res.prescription._id}/finalize`, { method: "POST", facilityId, body: payload() });
      setStatus(fin.prescription.status);
      toast("Prescription finalized.");
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      setBusy(false);
    }
  }

  async function revise() {
    setBusy(true);
    try {
      const res = await api(`/api/prescriptions/${rxId}/revise`, { method: "POST", facilityId });
      toast("Revision draft created. History of the original is unchanged.");
      navigate(`/app/prescriptions/${res.prescription._id}`);
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    const saved = rxId || (await saveDraft());
    if (!saved) return;
    try {
      await downloadBinary(`/api/prescriptions/${saved}/pdf`, {
        facilityId,
        filename: `prescription-${form.patientSnapshot.mrn || saved}.pdf`,
      });
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  function pickPatient(pid) {
    const p = patients.find((x) => x._id === pid);
    setForm((f) => ({
      ...f,
      patientId: pid,
      patientSnapshot: {
        ...f.patientSnapshot,
        name: p?.name || "",
        mrn: p?.mrn || "",
        age: p?.age != null ? String(p.age) : "",
        sex: p?.sex || "",
        address: [p?.city, p?.district].filter(Boolean).join(", "),
      },
    }));
  }

  if (isNew && !isDoctor) {
    return <p className="text-ink-soft">Only the treating doctor can create a prescription.</p>;
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.2em] text-teal-800 uppercase">Clinical document</p>
          <h1 className="font-display text-4xl">Prescription</h1>
          <p className="text-ink-soft">
            {status.replaceAll("_", " ")}
            {locked ? " — clinical content is locked. Create a revision to amend." : " — draft, editable until finalized."}
          </p>
        </div>
        <Link className="text-sm font-semibold text-teal-800" to="/app/prescriptions">
          Back to list
        </Link>
      </div>

      <fieldset disabled={locked || busy} className="space-y-8">
        <section>
          <h2 className="font-display text-2xl">Patient</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Select label="Selected patient" value={form.patientId} onChange={(e) => pickPatient(e.target.value)} required disabled={!isNew && locked}>
              <option value="">Select</option>
              {patients.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.mrn})
                </option>
              ))}
            </Select>
            <Input label="Date" value={form.patientSnapshot.date} onChange={(e) => setForm({ ...form, patientSnapshot: { ...form.patientSnapshot, date: e.target.value } })} />
            <Input label="Patient name" value={form.patientSnapshot.name} onChange={(e) => setForm({ ...form, patientSnapshot: { ...form.patientSnapshot, name: e.target.value } })} />
            <Input label="Patient ID" value={form.patientSnapshot.mrn} onChange={(e) => setForm({ ...form, patientSnapshot: { ...form.patientSnapshot, mrn: e.target.value } })} />
            <Input label="Age" value={form.patientSnapshot.age} onChange={(e) => setForm({ ...form, patientSnapshot: { ...form.patientSnapshot, age: e.target.value } })} />
            <Input label="Sex" value={form.patientSnapshot.sex} onChange={(e) => setForm({ ...form, patientSnapshot: { ...form.patientSnapshot, sex: e.target.value } })} />
            <Input className="md:col-span-2" label="Address" value={form.patientSnapshot.address} onChange={(e) => setForm({ ...form, patientSnapshot: { ...form.patientSnapshot, address: e.target.value } })} />
            <Input label="BP" value={form.vitals.bp} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, bp: e.target.value } })} />
            <Input label="Temperature" value={form.vitals.temperature} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, temperature: e.target.value } })} />
            <Input label="Pulse" value={form.vitals.pulse} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, pulse: e.target.value } })} />
            <Input label="Weight" value={form.vitals.weight} onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, weight: e.target.value } })} />
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl">Diagnosis</h2>
          <div className="mt-3 grid gap-3">
            <label className="block text-sm font-medium">
              Primary complaint / symptoms
              <textarea className="mt-1 min-h-16 w-full rounded-xl border border-line px-3 py-2" value={form.chiefComplaint} onChange={(e) => setForm({ ...form, chiefComplaint: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">
              Diagnosis
              <textarea className="mt-1 min-h-16 w-full rounded-xl border border-line px-3 py-2" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">
              Clinical notes
              <textarea className="mt-1 min-h-16 w-full rounded-xl border border-line px-3 py-2" value={form.clinicalNotes} onChange={(e) => setForm({ ...form, clinicalNotes: e.target.value })} />
            </label>
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl">Medicines</h2>
          <div className="mt-3 space-y-4">
            {form.medicines.map((m, i) => (
              <div key={i} className="rounded-xl border border-line p-4">
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                  <span>Medicine {i + 1}</span>
                  <div className="flex gap-2">
                    <button type="button" className="text-ink-soft" disabled={i === 0} onClick={() => moveMed(form, setForm, i, -1)}>
                      Up
                    </button>
                    <button type="button" className="text-ink-soft" disabled={i === form.medicines.length - 1} onClick={() => moveMed(form, setForm, i, 1)}>
                      Down
                    </button>
                    {form.medicines.length > 1 && (
                      <button type="button" className="text-danger" onClick={() => setForm({ ...form, medicines: form.medicines.filter((_, n) => n !== i) })}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input label="Medicine name" value={m.name} onChange={(e) => patchMed(form, setForm, i, { name: e.target.value })} />
                  <Input label="Strength" value={m.strength} onChange={(e) => patchMed(form, setForm, i, { strength: e.target.value })} />
                  <Input label="Dosage" value={m.dosage} onChange={(e) => patchMed(form, setForm, i, { dosage: e.target.value })} hint="e.g. 1-0-1" />
                  <Input label="Frequency / schedule" value={m.frequency} onChange={(e) => patchMed(form, setForm, i, { frequency: e.target.value })} />
                  <Input label="Duration" value={m.duration} onChange={(e) => patchMed(form, setForm, i, { duration: e.target.value })} />
                  <Input label="Additional instructions" value={m.instructions} onChange={(e) => patchMed(form, setForm, i, { instructions: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" className="mt-3" onClick={() => setForm({ ...form, medicines: [...form.medicines, emptyMed()] })}>
            + Add medicine
          </Button>
        </section>

        <section>
          <h2 className="font-display text-2xl">Investigations</h2>
          <div className="mt-3 space-y-2">
            {form.investigations.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={t.advised !== false} onChange={(e) => patchInv(form, setForm, i, { advised: e.target.checked })} />
                  Advise
                </label>
                <input
                  className="min-h-11 flex-1 rounded-xl border border-line px-3"
                  placeholder="Test name"
                  value={t.name}
                  onChange={(e) => patchInv(form, setForm, i, { name: e.target.value })}
                />
                <button type="button" className="text-sm text-danger" onClick={() => setForm({ ...form, investigations: form.investigations.filter((_, n) => n !== i) })}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" className="mt-2" onClick={() => setForm({ ...form, investigations: [...form.investigations, { name: "", advised: true }] })}>
            + Add investigation
          </Button>
        </section>

        <section>
          <h2 className="font-display text-2xl">General advice</h2>
          <div className="mt-3 space-y-2">
            {form.adviceItems.map((a, i) => (
              <div key={i} className="flex gap-2">
                <input className="min-h-11 flex-1 rounded-xl border border-line px-3" value={a} onChange={(e) => setForm({ ...form, adviceItems: form.adviceItems.map((x, n) => (n === i ? e.target.value : x)) })} />
                <button type="button" className="text-sm text-danger" onClick={() => setForm({ ...form, adviceItems: form.adviceItems.filter((_, n) => n !== i) })}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" className="mt-2" onClick={() => setForm({ ...form, adviceItems: [...form.adviceItems, ""] })}>
            + Add advice
          </Button>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <Input label="Follow-up date" type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />
          <div>
            <p className="mb-1.5 text-sm font-medium">Substitution permitted</p>
            <div className="flex gap-4 pt-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="sub" checked={form.substitutionAllowed === true} onChange={() => setForm({ ...form, substitutionAllowed: true })} />
                Yes
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="sub" checked={form.substitutionAllowed === false} onChange={() => setForm({ ...form, substitutionAllowed: false })} />
                No
              </label>
            </div>
          </div>
        </section>
      </fieldset>

      <div className="no-print mt-8 flex flex-wrap gap-3">
        {!locked && (
          <Button type="button" variant="outline" disabled={busy} onClick={saveDraft}>
            Save draft
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={() => setPreview(true)}>
          Preview
        </Button>
        {isDoctor && !locked && (
          <Button type="button" disabled={busy} onClick={finalize}>
            Finalize
          </Button>
        )}
        {isDoctor && locked && (
          <Button type="button" variant="outline" onClick={revise}>
            Create revision
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={download}>
          Download PDF
        </Button>
      </div>

      {preview && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-teal-950/50 p-4" role="dialog" aria-modal="true">
          <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="outline" onClick={() => setPreview(false)}>
              Close
            </Button>
          </div>
          <div className="rx-print-root">
            <PrescriptionDocument doc={liveDoc} />
          </div>
        </div>
      )}
    </div>
  );
}

function usePatients(facilityId) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api("/api/patients", { facilityId })
      .then((d) => setRows(d.patients || []))
      .catch(() => setRows([]));
  }, [facilityId]);
  return rows;
}

function patchMed(form, setForm, i, patch) {
  setForm({ ...form, medicines: form.medicines.map((m, n) => (n === i ? { ...m, ...patch } : m)) });
}
function patchInv(form, setForm, i, patch) {
  setForm({ ...form, investigations: form.investigations.map((m, n) => (n === i ? { ...m, ...patch } : m)) });
}
function moveMed(form, setForm, i, dir) {
  const next = [...form.medicines];
  const j = i + dir;
  if (j < 0 || j >= next.length) return;
  [next[i], next[j]] = [next[j], next[i]];
  setForm({ ...form, medicines: next });
}
