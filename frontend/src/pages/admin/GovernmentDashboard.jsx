import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useCountUp } from "../../hooks/useCountUp.js";
import { Card, Skeleton, StatCard } from "../../components/ui/index.jsx";

function N({ n }) {
  return useCountUp(n);
}

export default function GovernmentDashboard() {
  const { network } = useAuth();
  const { data, loading, error } = useApi("/api/analytics/government");
  if (loading) return <Skeleton className="h-48" />;
  if (error) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-red-50 p-6">
        <p className="text-danger">Unable to load dashboard data.</p>
        <p className="mt-1 text-sm text-ink-soft">{error}</p>
      </div>
    );
  }
  const k = data.kpis;
  const maxDemand = Math.max(1, ...(data.demand || []).map((d) => d.appointments));
  const networkName = network?.name || data.network?.name || "Provider network";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-[0.22em] text-gold uppercase">Healthcare Network Command Center</p>
        <h1 className="font-display text-4xl">{networkName}</h1>
        <p className="max-w-2xl text-ink-soft">
          Aggregated operational intelligence. Individual medical records are not shown here — access follows minimum-necessary rules.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's appointments" value={<N n={k.todayAppointments} />} hint="Network-wide, India time" />
        <StatCard label="Waiting patients" value={<N n={k.waitingPatients} />} />
        <StatCard label="Completed consultations" value={<N n={k.completedConsultations ?? k.todayConsultations} />} />
        <StatCard label="Pending follow-ups" value={<N n={k.pendingFollowUps} />} hint="Due today or overdue" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total facilities" value={<N n={k.totalFacilities} />} />
        <StatCard label="Verified facilities" value={<N n={k.verifiedFacilities} />} />
        <StatCard label="Pending verification" value={<N n={k.pendingVerification} />} hint="Review the verification queue" />
        <StatCard label="Active doctors" value={<N n={k.activeDoctors} />} />
        <StatCard label="Patients served" value={<N n={k.patientsServed} />} />
        <StatCard label="Referral completion" value={`${k.referralCompletionRate}%`} />
        <StatCard label="Waiting now" value={<N n={k.averageWaitingQueue} />} />
        <StatCard label="Open high-priority referrals" value={<N n={k.highRiskOpenReferrals} />} hint="Urgent / emergency, not closed" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-2xl">Where demand is rising</h2>
          <p className="text-sm text-ink-soft">Appointments in the last 7 days by district</p>
          <div className="mt-4 space-y-3">
            {(data.demand || []).map((d) => (
              <div key={d._id}>
                <div className="flex justify-between text-sm">
                  <span>{d._id}</span>
                  <span className="tabular-nums">{d.appointments}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper">
                  <div className="h-full bg-teal-600" style={{ width: `${(d.appointments / maxDemand) * 100}%` }} />
                </div>
              </div>
            ))}
            {!data.demand?.length && <p className="text-sm text-ink-soft">No recent appointment volume.</p>}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-2xl">Service availability</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between">
              <span>Facilities with diagnostics</span>
              <strong>{k.diagnosticAvailability}</strong>
            </li>
            <li className="flex justify-between">
              <span>Facilities with medicine services</span>
              <strong>{k.medicineAvailability}</strong>
            </li>
            <li className="flex justify-between">
              <span>Referral pathway failures</span>
              <strong>{k.referralFailures}</strong>
            </li>
            <li className="flex justify-between">
              <span>Open follow-ups</span>
              <strong>{k.pendingFollowUps}</strong>
            </li>
          </ul>
          <Link className="mt-5 inline-block text-sm font-semibold text-teal-800" to="/app/verification">
            Review pending facilities →
          </Link>
        </Card>
      </div>
      <Card className="p-5">
        <h2 className="font-display text-2xl">District coverage</h2>
        <p className="text-sm text-ink-soft">{networkName} → district → verified facilities. Occupancy hint flags likely overload.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data.byDistrict || []).map((d) => (
            <div key={d._id} className="rounded-2xl border border-line p-4">
              <p className="font-semibold">{d._id}</p>
              <p className="text-2xl font-display text-teal-900">{d.count}</p>
              <p className="text-xs text-ink-soft">{d.overloaded ? `${d.overloaded} possibly overloaded` : "Capacity within range"}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
