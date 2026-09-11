import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { useCountUp } from "../../hooks/useCountUp.js";
import { Badge, Button, Card, EmptyState, Skeleton, StatCard, StatusDot, TodayBadge } from "../../components/ui/index.jsx";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

function Hour({ n }) {
  return useCountUp(n);
}

export default function DoctorDashboard() {
  const { data, loading, error, reload, facilityId } = useApi("/api/analytics/doctor");
  const { user } = useAuth();
  const toast = useToast();
  const [savingToday, setSavingToday] = useState(false);

  async function setToday(active) {
    setSavingToday(true);
    try {
      await api("/api/doctors/today-status", { method: "PATCH", facilityId, body: { active } });
      await reload({ silent: true });
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      setSavingToday(false);
    }
  }
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-red-50 p-6">
        <p className="text-danger">Unable to load dashboard data.</p>
        <p className="mt-1 text-sm text-ink-soft">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => reload()}>
          Retry
        </Button>
      </div>
    );
  }
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const k = data.kpis || {};
  const todayAppointments = k.todayAppointments ?? 0;
  const waitingPatients = k.waitingPatients ?? k.waiting ?? 0;
  const completedConsultations = k.completedConsultations ?? k.completed ?? 0;
  const pendingFollowUps = k.pendingFollowUps ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] text-teal-800 uppercase">Clinical board</p>
          <h1 className="font-display text-4xl">
            {hello}, {user?.name || data.greetingName}
          </h1>
          <p className="mt-1 text-ink-soft">Counts are for today (India time) at the selected facility, for your list only.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TodayBadge active={!!data.todayActive} />
          <div className="inline-flex rounded-xl border border-line p-1">
            <button
              type="button"
              disabled={savingToday}
              className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${data.todayActive ? "bg-teal-900 text-white" : "text-ink-soft"}`}
              onClick={() => setToday(true)}
            >
              Active
            </button>
            <button
              type="button"
              disabled={savingToday}
              className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${!data.todayActive ? "bg-teal-900 text-white" : "text-ink-soft"}`}
              onClick={() => setToday(false)}
            >
              Inactive
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's appointments" value={<Hour n={todayAppointments} />} hint="Scheduled today — does not drop when completed" />
        <StatCard label="Waiting patients" value={<Hour n={waitingPatients} />} hint="Status WAITING" />
        <StatCard label="Completed consultations" value={<Hour n={completedConsultations} />} hint="Status COMPLETED today" />
        <StatCard label="Pending follow-ups" value={<Hour n={pendingFollowUps} />} hint="Due today or overdue" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <h2 className="font-display text-2xl">Today's schedule</h2>
          <div className="mt-4 space-y-3">
            {data.appointments?.length ? (
              data.appointments.map((a) => (
                <div key={a._id} className="flex items-center justify-between gap-3 border-b border-line/80 py-3 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="w-16 tabular-nums text-sm text-teal-800">
                      {new Date(a.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <div>
                      <p className="font-semibold">{a.patientId?.name}</p>
                      <p className="text-xs text-ink-soft">{a.reason}</p>
                    </div>
                  </div>
                  <Badge
                    tone={
                      a.status === "WAITING"
                        ? "warn"
                        : a.status === "COMPLETED"
                          ? "ok"
                          : a.status === "CANCELLED" || a.status === "NO_SHOW"
                            ? "danger"
                            : "neutral"
                    }
                  >
                    {a.status.replaceAll("_", " ")}
                  </Badge>
                </div>
              ))
            ) : (
              <EmptyState title="No appointments today" body="When patients are booked to this facility, they will appear on this timeline." />
            )}
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-2xl">Patient queue</h2>
            <ul className="mt-4 space-y-3">
              {data.queue?.length ? (
                data.queue.map((q, i) => (
                  <li key={q._id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <StatusDot status={q.status} />
                      {q.tokenNumber != null && <span className="tabular-nums text-ink-soft">Token {String(q.tokenNumber).padStart(3, "0")}</span>}
                      {q.patientId?.name}
                    </span>
                    <span className="text-xs">{i === 0 && q.status === "WAITING" ? "Next" : q.status.replaceAll("_", " ")}</span>
                  </li>
                ))
              ) : (
                <p className="text-sm text-ink-soft">Queue is clear.</p>
              )}
            </ul>
            <Link className="mt-4 inline-block text-sm font-semibold text-teal-800" to="/app/queue">
              Open queue →
            </Link>
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-2xl">Quick actions</h2>
            <div className="mt-4 grid gap-2">
              <Button className="w-full" onClick={() => (window.location.href = "/app/queue")}>
                Start consultation
              </Button>
              <Link className="rounded-xl border border-line px-4 py-3 text-center text-sm font-semibold" to="/app/patients">
                Add patient
              </Link>
              <Link className="rounded-xl border border-line px-4 py-3 text-center text-sm font-semibold" to="/app/referrals">
                Create referral
              </Link>
              <Link className="rounded-xl border border-line px-4 py-3 text-center text-sm font-semibold" to="/app/prescriptions/new">
                Write prescription
              </Link>
            </div>
          </Card>
        </div>
      </div>
      <Card className="p-5">
        <h2 className="font-display text-2xl">Follow-ups</h2>
        {data.followUps?.length ? (
          <ul className="mt-3 divide-y divide-line">
            {data.followUps.map((f) => (
              <li key={f._id} className="flex justify-between py-3 text-sm">
                <span>{f.patientId?.name}</span>
                <span className="text-ink-soft">
                  {new Date(f.dueAt).toLocaleDateString()} · {f.reason}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">No pending follow-ups due today or overdue.</p>
        )}
      </Card>
    </div>
  );
}
