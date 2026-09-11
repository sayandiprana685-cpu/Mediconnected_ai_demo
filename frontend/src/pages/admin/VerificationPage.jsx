import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Badge, Button, Card, EmptyState } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function VerificationPage() {
  const { data, reload, error } = useApi("/api/admin/verifications");
  const toast = useToast();

  async function decide(id, decision) {
    try {
      await api(`/api/admin/facilities/${id}/decision`, { method: "POST", body: { decision } });
      toast(decision === "VERIFY" ? "Verified." : "Rejected.");
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (error) return <p className="text-danger">{error}</p>;

  return (
    <div>
      <h1 className="font-display text-4xl">Verification queue</h1>
      <p className="text-ink-soft">Facilities waiting for government review. Only VERIFIED sites become fully operational.</p>
      <div className="mt-6 grid gap-4">
        {data?.requests?.map((r) => (
          <Card key={r._id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">{r.facilityId?.name}</h2>
                <p className="text-sm text-ink-soft">
                  {r.facilityId?.type?.replaceAll("_", " ")} · {r.facilityId?.city}, {r.facilityId?.district} · {r.facilityId?.licenceNumber}
                </p>
              </div>
              <Badge tone="warn">{r.status?.replaceAll("_", " ")}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => decide(r.facilityId?._id || r.facilityId, "VERIFY")}>Verify</Button>
              <Button variant="outline" onClick={() => decide(r.facilityId?._id || r.facilityId, "REQUEST_CORRECTION")}>
                Request correction
              </Button>
              <Button variant="outline" onClick={() => decide(r.facilityId?._id || r.facilityId, "REJECT")}>
                Reject
              </Button>
              <Link className="rounded-xl border border-line px-4 py-2 text-sm font-semibold" to={`/app/facilities/${r.facilityId?._id}`}>
                Open dossier
              </Link>
            </div>
          </Card>
        ))}
      </div>
      {!data?.requests?.length && <EmptyState title="No pending verifications" body="New facility registrations will land in this queue." />}
    </div>
  );
}
