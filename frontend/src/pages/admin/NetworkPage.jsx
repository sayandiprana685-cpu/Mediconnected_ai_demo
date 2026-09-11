import { Link } from "react-router-dom";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { Badge, Card, EmptyState, Skeleton } from "../../components/ui/index.jsx";

export default function NetworkPage() {
  const { network } = useAuth();
  const { data, loading, error } = useApi("/api/admin/facilities");
  const gov = useApi("/api/analytics/government");
  if (loading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-danger">{error}</p>;

  const groups = {};
  for (const f of data?.facilities || []) {
    groups[f.district] = groups[f.district] || [];
    groups[f.district].push(f);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl">Care network</h1>
        <p className="text-ink-soft">
          {(network?.name || gov.data?.network?.name || "Network") + " → district → facility. Use this map of the registry to spot coverage gaps."}
        </p>
      </div>
      {Object.entries(groups).map(([district, facilities]) => (
        <Card key={district} className="p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl">{district}</h2>
            <span className="text-sm text-ink-soft">{facilities.length} facilities</span>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {facilities.map((f) => (
              <li key={f._id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <Link className="font-semibold text-teal-800" to={`/app/facilities/${f._id}`}>
                  {f.name}
                </Link>
                <span className="text-ink-soft">
                  {f.city} · {f.type?.replaceAll("_", " ")}
                </span>
                <Badge tone={f.status === "VERIFIED" ? "ok" : "warn"}>{statusLabel(f.status)}</Badge>
                {f.occupancyHint > 75 && <Badge tone="danger">Likely overloaded</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {!data?.facilities?.length && <EmptyState title="Empty network" body="Register facilities to populate the district view." />}
      {gov.data?.demand?.length ? (
        <Card className="p-5">
          <h2 className="font-display text-2xl">Demand pressure (7 days)</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {gov.data.demand.map((d) => (
              <li key={d._id} className="flex justify-between">
                <span>{d._id}</span>
                <span className="tabular-nums">{d.appointments} appointments</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
