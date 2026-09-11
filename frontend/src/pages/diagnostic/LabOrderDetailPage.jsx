import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi, statusLabel } from "../../hooks/useApi.js";
import { api, downloadBinary } from "../../services/api.js";
import { Badge, Button, Card, Input, Skeleton } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

export default function LabOrderDetailPage() {
  const { id } = useParams();
  const { data, loading, error, reload, facilityId } = useApi(`/api/diagnostics/orders/${id}`);
  const toast = useToast();
  const [results, setResults] = useState([{ name: "", value: "", unit: "", referenceRange: "", flag: "", remarks: "" }]);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!data?.order) return;
    setRemarks(data.order.remarks || "");
    if (data.order.results?.length) setResults(data.order.results);
    else setResults([{ name: data.order.testName, value: "", unit: "", referenceRange: "", flag: "", remarks: "" }]);
  }, [data]);

  async function saveResults(e) {
    e.preventDefault();
    try {
      await api(`/api/diagnostics/orders/${id}/results`, { method: "PATCH", facilityId, body: { results, remarks } });
      toast("Results saved.");
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  async function pdf() {
    try {
      await downloadBinary(`/api/diagnostics/orders/${id}/pdf`, { facilityId, filename: "lab-report.pdf" });
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (loading) return <Skeleton className="h-40" />;
  if (error) return <p className="text-danger">{error}</p>;
  const o = data.order;

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800" to="/app/lab-orders">
          ← Orders
        </Link>
        <h1 className="mt-2 font-display text-4xl">{o.testName}</h1>
        <p className="text-ink-soft">
          {o.patientId?.name} · {o.patientId?.mrn} · {statusLabel(o.status)}
        </p>
        <Badge className="mt-2">{o.urgency}</Badge>
      </div>
      <Card className="p-5">
        <h2 className="font-display text-2xl">Results</h2>
        <form className="mt-4 space-y-3" onSubmit={saveResults}>
          {results.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-2">
              <Input label="Analyte" value={r.name} onChange={(e) => setResults(results.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)))} />
              <Input label="Value" value={r.value} onChange={(e) => setResults(results.map((x, n) => (n === i ? { ...x, value: e.target.value } : x)))} />
              <Input label="Units" value={r.unit} onChange={(e) => setResults(results.map((x, n) => (n === i ? { ...x, unit: e.target.value } : x)))} />
              <Input label="Reference range" value={r.referenceRange} onChange={(e) => setResults(results.map((x, n) => (n === i ? { ...x, referenceRange: e.target.value } : x)))} />
            </div>
          ))}
          <Input label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          <Button type="submit">Save results</Button>
        </form>
      </Card>
      {["REPORT_READY", "DELIVERED"].includes(o.status) && (
        <Button variant="outline" onClick={pdf}>
          Download PDF
        </Button>
      )}
    </div>
  );
}
