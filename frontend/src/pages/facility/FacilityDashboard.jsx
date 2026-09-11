import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useCountUp } from "../../hooks/useCountUp.js";
import { Badge, Card, Skeleton, StatCard, StatusDot, TodayBadge } from "../../components/ui/index.jsx";

function N({ n }) {
  return useCountUp(n);
}

export default function FacilityDashboard() {
  const { facilities, facilityId } = useAuth();
  const { data, loading, error } = useApi("/api/analytics/facility");
  if (loading) return <Skeleton className="h-40" />;
  if (error) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-red-50 p-6">
        <p className="text-danger">Unable to load dashboard data.</p>
        <p className="mt-1 text-sm text-ink-soft">{error}</p>
      </div>
    );
  }
  const k = data.kpis;
  const current = facilities.find((f) => String(f._id) === String(facilityId)) || facilities[0];
  const type = current?.type || data.facility?.type;
  const hospital = type === "HOSPITAL";

  const stages = ["BOOKED", "CONFIRMED", "CHECKED_IN", "WAITING", "IN_CONSULTATION", "COMPLETED"];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-[0.2em] text-teal-800 uppercase">{type?.replaceAll("_", " ")} operations</p>
        <h1 className="font-display text-4xl">{current?.name || data.facility?.name}</h1>
        <p className="text-ink-soft">{hospital ? "Full hospital command view for today's flow." : "A focused clinic / facility view of today's work."}</p>
        <Link className="mt-2 inline-block text-sm font-semibold text-teal-800" to="/app/medicine-orders">
          Medicine orders
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's appointments" value={<N n={k.todayAppointments ?? k.appointments} />} hint="All scheduled today at this facility" />
        <StatCard label="Waiting patients" value={<N n={k.waitingPatients ?? k.waiting} />} hint="WAITING status" />
        <StatCard label="Completed consultations" value={<N n={k.completedConsultations} />} />
        <StatCard label="Pending follow-ups" value={<N n={k.pendingFollowUps ?? k.followUps} />} hint="Due today or overdue" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Today's patients" value={<N n={k.todayPatients} />} />
        <StatCard label="Doctors active" value={<N n={k.doctorsActive} />} />
        <StatCard label="Pending referrals" value={<N n={k.pendingReferrals} />} />
      </div>
      <Card className="p-5">
        <h2 className="font-display text-2xl">Patient flow</h2>
        <p className="text-sm text-ink-soft">Registered → checked-in → waiting → consultation → completed</p>
        <div className="mt-5 grid gap-3 md:grid-cols-6">
          {stages.map((s) => (
            <div key={s} className="rounded-2xl border border-line p-3 text-center">
              <p className="text-[11px] tracking-wide text-ink-soft uppercase">{s.replaceAll("_", " ")}</p>
              <p className="font-display text-3xl text-teal-900">{data.flow?.[s] || 0}</p>
            </div>
          ))}
        </div>
      </Card>
      <div className={`grid gap-6 ${hospital ? "lg:grid-cols-2" : ""}`}>
        <Card className="p-5">
          <h2 className="font-display text-2xl">Doctor availability</h2>
          <ul className="mt-4 space-y-3">
            {data.doctors?.map((d) => (
              <li key={d._id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <StatusDot status={d.todayActive ? "ACTIVE" : "OFFLINE"} />
                  {d.userId?.name}
                </span>
                <TodayBadge active={!!d.todayActive} />
              </li>
            ))}
            {!data.doctors?.length && <p className="text-sm text-ink-soft">No doctors linked yet.</p>}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-2xl">Referral status</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {data.referrals?.map((r) => (
              <li key={r._id} className="flex justify-between gap-3">
                <span>{r.patientId?.name}</span>
                <Badge tone="warn">{r.status.replaceAll("_", " ")}</Badge>
              </li>
            ))}
            {!data.referrals?.length && <p className="text-ink-soft">No pending referrals.</p>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
