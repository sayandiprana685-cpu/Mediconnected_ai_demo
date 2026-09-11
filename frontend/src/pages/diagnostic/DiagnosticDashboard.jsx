import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useCountUp } from "../../hooks/useCountUp.js";
import { Badge, Card, Skeleton, StatCard } from "../../components/ui/index.jsx";

function N({ n }) {
  return useCountUp(n);
}

export default function DiagnosticDashboard() {
  const { facilities, facilityId } = useAuth();
  const { data, loading, error } = useApi("/api/diagnostics/dashboard");
  if (loading) return <Skeleton className="h-40" />;
  if (error) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-red-50 p-6">
        <p className="text-danger">Unable to load dashboard data.</p>
        <p className="mt-1 text-sm text-ink-soft">{error}</p>
      </div>
    );
  }
  const k = data.kpis || {};
  const current = facilities.find((f) => String(f._id) === String(facilityId)) || facilities[0];
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-[0.2em] text-teal-800 uppercase">{(current?.type || data.facility?.type || "").replaceAll("_", " ")} operations</p>
        <h1 className="font-display text-4xl">{current?.name || data.facility?.name}</h1>
        <p className="text-ink-soft">Today’s laboratory workload for this centre only.</p>
        <Link className="mt-2 inline-block text-sm font-semibold text-teal-800" to="/app/medicine-orders">
          Medicine orders
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's test orders" value={<N n={k.todayOrders} />} />
        <StatCard label="Pending orders" value={<N n={k.pendingOrders} />} />
        <StatCard label="Samples pending" value={<N n={k.samplesPending} />} />
        <StatCard label="Samples collected" value={<N n={k.samplesCollected} />} />
        <StatCard label="Tests in progress" value={<N n={k.inProgress} />} />
        <StatCard label="Reports pending" value={<N n={k.reportsPending} />} />
        <StatCard label="Reports completed" value={<N n={k.reportsCompleted} />} />
        <StatCard label="Urgent / critical" value={<N n={k.criticalReports} />} />
      </div>
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Recent orders</h2>
          <Link className="text-sm font-semibold text-teal-800" to="/app/lab-orders">
            Open orders
          </Link>
        </div>
        <ul className="mt-4 space-y-3 text-sm">
          {(data.recent || []).map((o) => (
            <li key={o._id} className="flex justify-between gap-3 border-b border-line py-2 last:border-0">
              <span>
                {o.patientId?.name} · {o.testName}
              </span>
              <Badge>{String(o.status || "").replaceAll("_", " ")}</Badge>
            </li>
          ))}
          {!data.recent?.length && <p className="text-ink-soft">No orders yet.</p>}
        </ul>
      </Card>
    </div>
  );
}
