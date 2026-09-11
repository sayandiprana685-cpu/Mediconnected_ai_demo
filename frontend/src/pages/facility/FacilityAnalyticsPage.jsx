import { useApi } from "../../hooks/useApi.js";
import { Card, Skeleton, StatCard, StatusDot, TodayBadge } from "../../components/ui/index.jsx";

export default function FacilityAnalyticsPage() {
  const { data, loading, error } = useApi("/api/analytics/facility");
  const avail = useApi("/api/doctors/availability");
  if (loading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-danger">{error}</p>;
  const k = data.kpis;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl">Operational analytics</h1>
        <p className="text-ink-soft">Facility-scoped counts only — not a population health extract.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Today's appointments" value={k.appointments} />
        <StatCard label="Waiting now" value={k.waiting} />
        <StatCard label="Open referrals" value={k.pendingReferrals} />
      </div>
      <Card className="p-5">
        <h2 className="font-display text-2xl">Doctor availability</h2>
        <ul className="mt-4 space-y-3">
          {(avail.data?.doctors || data.doctors || []).map((d) => (
            <li key={d._id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <StatusDot status={d.todayActive ? "ACTIVE" : "OFFLINE"} />
                {d.userId?.name}
              </span>
              <span className="flex items-center gap-2 text-ink-soft">
                {d.doctorProfileId?.specialization}
                <TodayBadge active={!!d.todayActive} />
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <h2 className="font-display text-2xl">Today's status mix</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {Object.entries(data.flow || {}).map(([s, n]) => (
            <div key={s} className="rounded-xl border border-line px-3 py-2 text-sm">
              <span className="text-ink-soft">{s.replaceAll("_", " ")}</span>
              <span className="ml-2 font-semibold tabular-nums">{n}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
