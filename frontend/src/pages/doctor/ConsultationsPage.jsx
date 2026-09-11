import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, Card, EmptyState, Input, Modal, Skeleton } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function ConsultationsPage() {
  const { data, loading, error, reload, facilityId } = useApi("/api/consultations");
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const selectedId = params.get("id");
  const selected = useMemo(
    () => (data?.consultations || []).find((c) => c._id === selectedId) || data?.consultations?.[0],
    [data, selectedId]
  );
  const [form, setForm] = useState({});
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpReason, setFollowUpReason] = useState("Clinical follow-up");
  const [confirmComplete, setConfirmComplete] = useState(false);

  useEffect(() => {
    if (selected) {
      setForm({
        chiefComplaint: selected.chiefComplaint || "",
        history: selected.history || "",
        examination: selected.examination || "",
        assessment: selected.assessment || "",
        plan: selected.plan || "",
        vitals: selected.vitals || { bp: "", pulse: "", temp: "", spo2: "" },
      });
    }
  }, [selected?._id]);

  async function save(complete) {
    try {
      await api(`/api/consultations/${selected._id}`, {
        method: "PATCH",
        facilityId,
        body: {
          ...form,
          status: complete ? "COMPLETED" : selected.status,
          followUpAt: complete && followUpAt ? followUpAt : undefined,
          followUpReason,
        },
      });
      toast(complete ? "Consultation completed." : "Notes saved.");
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (loading) return <Skeleton className="h-48" />;
  if (error) return <p className="text-danger">{error}</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div>
        <h1 className="font-display text-4xl">Consultations</h1>
        <p className="text-ink-soft">Document the encounter, then complete to close the queue token.</p>
        <ul className="mt-6 space-y-2">
          {(data?.consultations || []).map((c) => (
            <li key={c._id}>
              <button
                className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${c._id === selected?._id ? "border-teal-600 bg-teal-100" : "border-line bg-paper-2"}`}
                onClick={() => setParams({ id: c._id })}
              >
                <p className="font-semibold">{c.patientId?.name}</p>
                <p className="text-xs text-ink-soft">
                  {statusLabel(c.status)} · {new Date(c.createdAt).toLocaleString()}
                </p>
              </button>
            </li>
          ))}
        </ul>
        {!data?.consultations?.length && <EmptyState title="No consultations" body="Start from the queue when a patient is waiting." />}
      </div>
      {selected ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-widest text-ink-soft uppercase">{selected.patientId?.mrn}</p>
              <h2 className="font-display text-3xl">{selected.patientId?.name}</h2>
            </div>
            <Badge tone={selected.status === "COMPLETED" ? "ok" : "warn"}>{statusLabel(selected.status)}</Badge>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {["bp", "pulse", "temp", "spo2"].map((k) => (
              <Input
                key={k}
                label={k.toUpperCase()}
                value={form.vitals?.[k] || ""}
                onChange={(e) => setForm({ ...form, vitals: { ...form.vitals, [k]: e.target.value } })}
              />
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            <Input label="Chief complaint" value={form.chiefComplaint || ""} onChange={(e) => setForm({ ...form, chiefComplaint: e.target.value })} />
            <label className="block text-sm font-medium">
              History
              <textarea className="mt-1 min-h-24 w-full rounded-xl border border-line px-3 py-2" value={form.history || ""} onChange={(e) => setForm({ ...form, history: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">
              Examination
              <textarea className="mt-1 min-h-20 w-full rounded-xl border border-line px-3 py-2" value={form.examination || ""} onChange={(e) => setForm({ ...form, examination: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">
              Assessment
              <textarea className="mt-1 min-h-20 w-full rounded-xl border border-line px-3 py-2" value={form.assessment || ""} onChange={(e) => setForm({ ...form, assessment: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">
              Plan
              <textarea className="mt-1 min-h-20 w-full rounded-xl border border-line px-3 py-2" value={form.plan || ""} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
            </label>
          </div>
          {selected.status !== "COMPLETED" && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium">
                Follow-up date (optional)
                <input type="datetime-local" className="mt-1 min-h-11 w-full rounded-xl border border-line px-3" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
              </label>
              <Input label="Follow-up reason" value={followUpReason} onChange={(e) => setFollowUpReason(e.target.value)} />
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => save(false)} disabled={selected.status === "COMPLETED"}>
              Save notes
            </Button>
            <Button onClick={() => setConfirmComplete(true)} disabled={selected.status === "COMPLETED"}>
              Complete consultation
            </Button>
          </div>
        </Card>
      ) : null}
      <Modal open={confirmComplete} title="Complete consultation" onClose={() => setConfirmComplete(false)}>
        <p className="text-sm text-ink-soft">Are you sure you want to mark this consultation as completed?</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Patient</dt>
            <dd className="font-semibold">{selected?.patientId?.name}</dd>
          </div>
        </dl>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmComplete(false)}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setConfirmComplete(false);
              await save(true);
            }}
          >
            Complete consultation
          </Button>
        </div>
      </Modal>
    </div>
  );
}
