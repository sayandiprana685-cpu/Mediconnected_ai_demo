import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useCountUp } from "../../hooks/useCountUp.js";
import { Badge, Card, Skeleton, StatCard } from "../../components/ui/index.jsx";

function N({ n }) {
  return useCountUp(n);
}

export default function PharmacyDashboard() {
  const { facilities, facilityId } = useAuth();
  const { data, loading, error } = useApi("/api/pharmacy/dashboard", [], { pollMs: 8000 });
  if (loading) return <Skeleton className="h-40" />;
  if (error) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-red-50 p-6">
        <p className="text-danger">Unable to load dashboard data.</p>
        <p className="mt-1 text-sm text-ink-soft">{error}</p>
      </div>
    );
  }
  const k = data?.kpis || {};
  const current = facilities.find((f) => String(f._id) === String(facilityId)) || facilities[0];
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-[0.2em] text-teal-800 uppercase">{(current?.type || data.facility?.type || "").replaceAll("_", " ")} operations</p>
        <h1 className="font-display text-4xl">{current?.name || data.facility?.name}</h1>
        <p className="text-ink-soft">Dispensing and inventory for this pharmacy only.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's orders" value={<N n={k.todayOrders} />} />
        <StatCard label="Pending orders" value={<N n={k.pendingOrders} />} />
        <StatCard label="Orders ready" value={<N n={k.ordersReady} />} />
        <StatCard label="Dispensed" value={<N n={k.dispensedOrders} />} />
        <StatCard label="Low stock" value={<N n={k.lowStock} />} />
        <StatCard label="Out of stock" value={<N n={k.outOfStock} />} />
        <StatCard label="Expiring soon" value={<N n={k.expiringSoon} />} />
        <StatCard label="Prescriptions received" value={<N n={k.prescriptionsReceived} />} />
        <StatCard label="Incoming medicine orders" value={<N n={k.procurementIncoming} />} />
      </div>
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Recent orders</h2>
        <div className="flex items-center gap-4">
          <Link className="text-sm font-semibold text-teal-800" to="/app/pharmacy-orders">
            Open orders
          </Link>
          <Link className="text-sm font-semibold text-teal-800" to="/app/pharmacy-requests">
            Medicine requests
          </Link>
        </div>
        </div>
        <ul className="mt-4 space-y-3 text-sm">
          {(data.recent || []).map((o) => (
            <li key={`${o.kind || "row"}-${o._id}`} className="flex justify-between gap-3 border-b border-line py-2 last:border-0">
              {o.kind === "MEDICINE_ORDER" || o.requestNo ? (
                <Link className="font-semibold text-teal-800" to={`/app/pharmacy-requests/${o._id}`}>
                  {o.requestNo}
                  {o.fromFacility?.name ? ` · ${o.fromFacility.name}` : ""}
                </Link>
              ) : (
                <span>{o.patientId?.name || "Prescription"}</span>
              )}
              <Badge>{String(o.status || "").replaceAll("_", " ")}</Badge>
            </li>
          ))}
          {!data.recent?.length && <p className="text-ink-soft">No pharmacy orders yet.</p>}
        </ul>
      </Card>
    </div>
  );
}
