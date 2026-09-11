import { useApi } from "../../hooks/useApi.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { Card, Skeleton, StatCard } from "../../components/ui/index.jsx";

export default function GovAnalyticsPage() {
  const { network } = useAuth();
  const { data, loading, error } = useApi("/api/analytics/government");
  if (loading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-danger">{error}</p>;
  const k = data.kpis;
  const max = Math.max(1, ...(data.demand || []).map((d) => d.appointments));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl">Network analytics</h1>
        <p className="max-w-2xl text-ink-soft">
          Answers for stewardship{network?.name || data.network?.name ? ` across ${network?.name || data.network.name}` : ""}: where demand is rising, which districts look overloaded, and where referrals are failing. These are
          aggregates — not individual medical records.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Referral completion" value={`${k.referralCompletionRate}%`} />
        <StatCard label="Referral failures" value={k.referralFailures} hint="Declined, expired, or cancelled" />
        <StatCard label="Queue waiting now" value={k.averageWaitingQueue} />
        <StatCard label="Open follow-ups" value={k.pendingFollowUps} />
        <StatCard label="Diagnostics-capable sites" value={k.diagnosticAvailability} />
        <StatCard label="Medicine-capable sites" value={k.medicineAvailability} />
        <StatCard label="Patients in network" value={k.patientsServed} />
        <StatCard label="Today's consultations" value={k.todayConsultations} />
      </div>
      <Card className="p-5">
        <h2 className="font-display text-2xl">Where is demand increasing?</h2>
        <div className="mt-4 space-y-3">
          {(data.demand || []).map((d) => (
            <div key={d._id}>
              <div className="flex justify-between text-sm">
                <span>{d._id}</span>
                <span className="tabular-nums">{d.appointments}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper">
                <div className="h-full bg-teal-600" style={{ width: `${(d.appointments / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="font-display text-2xl">Which areas look overloaded?</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data.byDistrict || []).map((d) => (
            <div key={d._id} className="rounded-2xl border border-line p-4">
              <p className="font-semibold">{d._id}</p>
              <p className="font-display text-3xl text-teal-900">{d.count}</p>
              <p className="text-xs text-ink-soft">{d.overloaded ? `${d.overloaded} with occupancy hint over 75%` : "No overload flags"}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
