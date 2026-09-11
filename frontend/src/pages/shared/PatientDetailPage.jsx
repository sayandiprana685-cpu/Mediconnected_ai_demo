import { useParams } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { Badge, Card, EmptyState, Skeleton } from "../../components/ui/index.jsx";

export default function PatientDetailPage() {
  const { id } = useParams();
  const { data, loading, error } = useApi(`/api/patients/${id}`);
  if (loading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-danger">{error}</p>;
  const p = data.patient;
  const limited = data.access === "DIAGNOSTIC" || data.access === "PHARMACY";
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-widest text-ink-soft uppercase">{p.mrn}</p>
        <h1 className="font-display text-4xl">{p.name}</h1>
        <p className="text-ink-soft">
          {p.age} years · {p.sex} · {p.city}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase text-ink-soft">Allergies</p>
          <p className="mt-2">{p.allergies?.join(", ") || "None recorded"}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase text-ink-soft">Blood group</p>
          <p className="mt-2">{p.bloodGroup || "—"}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase text-ink-soft">Access</p>
          <p className="mt-2 text-sm text-ink-soft">
            {limited ? "Minimum-necessary view for this provider type." : "This view is limited to records from the selected facility."}
          </p>
        </Card>
      </div>
      {data.access === "DIAGNOSTIC" && (
        <Card className="p-5">
          <h2 className="font-display text-2xl">Laboratory orders</h2>
          {(data.orders || data.diagnostics || []).map((d) => (
            <p key={d._id} className="mt-2 text-sm">
              {d.testName} · <Badge>{d.status}</Badge>
            </p>
          ))}
        </Card>
      )}
      {data.access === "PHARMACY" && (
        <Card className="p-5">
          <h2 className="font-display text-2xl">Pharmacy workflow</h2>
          <p className="mt-2 text-sm text-ink-soft">Clinical notes, consultations, and unrelated prescriptions are not available to this pharmacy.</p>
        </Card>
      )}
      {!limited && (
        <>
          <Card className="p-5">
            <h2 className="font-display text-2xl">Clinical notes</h2>
            {data.records?.length ? (
              <ul className="mt-3 space-y-3">
                {data.records.map((r) => (
                  <li key={r._id} className="border-b border-line pb-3 text-sm">
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-ink-soft">{r.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No notes yet" body="Notes appear after a consultation is documented." />
            )}
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-2xl">Diagnostics</h2>
            {data.diagnostics?.length ? (
              data.diagnostics.map((d) => (
                <p key={d._id} className="mt-2 text-sm">
                  {d.testName} · <Badge>{d.status}</Badge> · {d.summary}
                </p>
              ))
            ) : (
              <p className="mt-2 text-sm text-ink-soft">No diagnostic reports at this facility.</p>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-2xl">Prescriptions</h2>
            {data.prescriptions?.map((rx) => (
              <div key={rx._id} className="mt-3 text-sm">
                {(rx.medicines?.length ? rx.medicines : rx.items || []).map((i, n) => (
                  <p key={n}>
                    {i.name || i.medicine} {i.strength || i.dose} — {i.frequency || i.dosage}
                  </p>
                ))}
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
