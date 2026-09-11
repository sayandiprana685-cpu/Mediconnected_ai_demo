import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { Badge, Button, Card, EmptyState, Modal, StatusDot } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function QueuePage() {
  const { data, reload, facilityId, error } = useApi("/api/queue");
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [completeTarget, setCompleteTarget] = useState(null);

  useEffect(() => {
    const t = setInterval(() => reload({ silent: true }), 8000);
    return () => clearInterval(t);
  }, [reload]);

  async function setStatus(id, status) {
    await api(`/api/queue/${id}`, { method: "PATCH", body: { status }, facilityId });
    reload({ silent: true });
  }

  async function start(appointmentId) {
    try {
      const res = await api("/api/consultations", { method: "POST", body: { appointmentId }, facilityId });
      toast("Consultation started. Complete it when the visit is finished.");
      navigate(`/app/consultations?id=${res.consultation._id}`);
    } catch (e) {
      toast(e.message, "danger");
    }
  }

  async function confirmComplete() {
    const q = completeTarget;
    if (!q) return;
    const appointmentId = q.appointmentId?._id || q.appointmentId;
    try {
      await api(`/api/appointments/${appointmentId}/complete`, { method: "POST", facilityId });
      toast("Consultation completed successfully.");
      setCompleteTarget(null);
      reload();
    } catch (e) {
      toast(e.message, "danger");
    }
  }

  if (error) return <p className="text-danger">{error}</p>;

  const appt = completeTarget?.appointmentId;
  const apptTime = appt?.scheduledAt || completeTarget?.createdAt;

  return (
    <div>
      <h1 className="font-display text-4xl">Queue</h1>
      <p className="text-ink-soft">Active board for today. Opening a patient does not complete the visit — confirm completion explicitly.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.queue?.map((q, i) => (
          <Card key={q._id} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs tracking-[0.2em] text-ink-soft uppercase">Token {String(q.tokenNumber).padStart(3, "0")}</p>
                <h2 className="font-display text-2xl">{q.patientId?.name}</h2>
                <p className="text-sm text-ink-soft">{q.doctorUserId?.name}</p>
                {q.appointmentId?.scheduledAt && (
                  <p className="text-xs text-ink-soft">{new Date(q.appointmentId.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                )}
              </div>
              <span className="flex items-center gap-2 text-sm">
                <StatusDot status={q.status} />
                {i === 0 && q.status === "WAITING" ? "Next" : statusLabel(q.status)}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {q.status === "CHECKED_IN" && (
                <Button variant="secondary" onClick={() => setStatus(q._id, "WAITING")}>
                  Move to waiting
                </Button>
              )}
              {user?.role === "DOCTOR" && ["WAITING", "CHECKED_IN"].includes(q.status) && (
                <Button onClick={() => start(q.appointmentId?._id || q.appointmentId)}>Start consultation</Button>
              )}
              {user?.role === "DOCTOR" && q.status === "IN_CONSULTATION" && (
                <Button onClick={() => setCompleteTarget(q)}>Complete consultation</Button>
              )}
              {q.status === "IN_CONSULTATION" && user?.role !== "DOCTOR" && <Badge tone="ok">In consultation</Badge>}
            </div>
          </Card>
        ))}
      </div>
      {!data?.queue?.length && (
        <div className="mt-8">
          <EmptyState title="No patients waiting" body="Check a confirmed appointment in to issue a token. Completed visits leave this board." />
        </div>
      )}
      {data?.completed?.length ? (
        <div className="mt-10">
          <h2 className="font-display text-2xl">Completed today</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.completed.map((q) => (
              <li key={q._id} className="flex justify-between py-3">
                <span>
                  Token {String(q.tokenNumber).padStart(3, "0")} · {q.patientId?.name}
                </span>
                <Badge tone="ok">Completed</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Modal open={!!completeTarget} title="Complete consultation" onClose={() => setCompleteTarget(null)}>
        <p className="text-sm text-ink-soft">Are you sure you want to mark this consultation as completed?</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-soft">Patient</dt>
            <dd className="font-semibold">{completeTarget?.patientId?.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-soft">Appointment</dt>
            <dd>{apptTime ? new Date(apptTime).toLocaleString() : "—"}</dd>
          </div>
        </dl>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCompleteTarget(null)}>
            Cancel
          </Button>
          <Button onClick={confirmComplete}>Complete consultation</Button>
        </div>
      </Modal>
    </div>
  );
}
