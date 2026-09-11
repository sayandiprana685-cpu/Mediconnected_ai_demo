import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { Badge, Button, Card, EmptyState, Input, Modal } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { canOrderLines } from "../../utils/medicineOrder.js";


function cartKey(facilityId) {
  return `mc-proc-cart-${facilityId || "none"}`;
}

function lineKey(m) {
  return [m.name, m.genericName, m.brandName, m.strength, m.dosageForm].join("|");
}

export default function MedicineOrderNewPage() {
  const { facilityId, facilities } = useAuth();
  const current = facilities.find((f) => String(f._id) === String(facilityId)) || facilities[0];
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState("");
  const [urgency, setUrgency] = useState("NORMAL");
  const [found, setFound] = useState(null);
  const [nearby, setNearby] = useState(false);
  const [finding, setFinding] = useState(false);
  const [selected, setSelected] = useState([]);
  const [detail, setDetail] = useState(null);
  const detailSeq = useRef(0);
  const [placing, setPlacing] = useState(false);
  const [sending, setSending] = useState(false);
  const [fulfillmentPick, setFulfillmentPick] = useState("PICKUP");
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaNotes, setAreaNotes] = useState("We need a pharmacy/medical shop in this area.");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartKey(facilityId));
      if (raw) setCart(JSON.parse(raw));
    } catch {
      setCart([]);
    }
  }, [facilityId]);

  useEffect(() => {
    localStorage.setItem(cartKey(facilityId), JSON.stringify(cart));
  }, [cart, facilityId]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api(`/api/procurement/medicines?q=${encodeURIComponent(q)}`, { facilityId });
        setHits(res.medicines || []);
      } catch (err) {
        setHits([]);
        toast(err.message, "danger");
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, facilityId]);

  function addMedicine(m) {
    const key = lineKey(m);
    setCart((prev) => {
      const i = prev.findIndex((x) => lineKey(x) === key);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], requestedQty: next[i].requestedQty + 1 };
        return next;
      }
      return [...prev, { ...m, requestedQty: 1, notes: "" }];
    });
    setQ("");
    setHits([]);
    toast("Added to requirement.");
  }

  function setQty(i, qty) {
    const n = Math.max(1, Number(qty) || 1);
    setCart((prev) => prev.map((x, idx) => (idx === i ? { ...x, requestedQty: n } : x)));
  }

  async function findPharmacies(forceNearby) {
    const useNearby = forceNearby ?? nearby;
    setFinding(true);
    try {
      const res = await api("/api/procurement/pharmacies", {
        method: "POST",
        facilityId,
        body: { items: cart, nearby: useNearby },
      });
      setFound(res);
      setNearby(useNearby);
      setSelected([]);
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      setFinding(false);
    }
  }

  function closeDetails() {
    detailSeq.current += 1;
    setDetail(null);
  }

  async function openDetails(pharmacy, lines) {
    const pharmacyId = String(pharmacy._id);
    const seq = ++detailSeq.current;
    setDetail({ pharmacy, lines: lines || [], loading: true, error: "" });
    setFulfillmentPick(pharmacy.deliveryAvailable ? "DELIVERY" : "PICKUP");
    try {
      const res = await api(`/api/procurement/pharmacies/${pharmacyId}`, { method: "POST", facilityId, body: { items: cart } });
      if (detailSeq.current !== seq) return;
      if (String(res.pharmacy?._id) !== pharmacyId) return;
      setDetail({ pharmacy: res.pharmacy, lines: res.lines || [], loading: false, error: "" });
    } catch (err) {
      if (detailSeq.current !== seq) return;
      setDetail((prev) =>
        prev && String(prev.pharmacy?._id) === pharmacyId ? { ...prev, loading: false, error: err.message || "Unable to load pharmacy details." } : prev
      );
    }
  }

  function requestThisPharmacy(pharmacyId) {
    const id = String(pharmacyId);
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
    closeDetails();
  }

  async function placeOrder(pharmacy, lines, fulfillment) {
    if (placing) return;
    if (!cart.length) return toast("Add medicines to the requirement first.", "danger");
    if (!canOrderLines(lines)) {
      return toast("This shop does not have the full requested quantity. Remove unavailable items or reduce quantity.", "danger");
    }
    setPlacing(true);
    try {
      const method = fulfillment || (pharmacy.deliveryAvailable ? "DELIVERY" : "PICKUP");
      const res = await api("/api/procurement/requests", {
        method: "POST",
        facilityId,
        body: { items: cart, pharmacyIds: [pharmacy._id], notes, urgency, fulfillment: method },
      });
      const order = res.requests?.[0];
      if (!order?._id) throw new Error(res.message || "Order was not created.");
      toast(`Order ${order.requestNo} placed.`);
      localStorage.removeItem(cartKey(facilityId));
      closeDetails();
      navigate(`/app/medicine-orders/${order._id}`);
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      setPlacing(false);
    }
  }

  async function send() {
    if (!selected.length) return toast("Select at least one pharmacy.", "danger");
    setSending(true);
    try {
      const res = await api("/api/procurement/requests", {
        method: "POST",
        facilityId,
        body: { items: cart, pharmacyIds: selected, notes, urgency },
      });
      toast(res.message);
      localStorage.removeItem(cartKey(facilityId));
      navigate(`/app/medicine-orders/${res.requests[0]._id}`);
    } catch (err) {
      toast(err.message, "danger");
    } finally {
      setSending(false);
    }
  }

  async function requestArea() {
    try {
      const res = await api("/api/procurement/area-request", { method: "POST", facilityId, body: { notes: areaNotes } });
      toast(res.message);
      setAreaOpen(false);
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  const groups = found?.groups || {};
  const noLocation = !current?.city && !current?.district;

  const summary = useMemo(
    () => cart.reduce((s, i) => s + (i.requestedQty || 0), 0),
    [cart]
  );

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800" to="/app/medicine-orders">
          ← Medicine orders
        </Link>
        <h1 className="mt-2 font-display text-4xl">Order medicines</h1>
        <p className="text-ink-soft">
          Ordering as <span className="font-semibold text-ink">{current?.name}</span>
          {current?.city ? ` · ${current.city}, ${current.district || ""}` : ""}. Requests stay on this facility.
        </p>
      </div>

      {noLocation && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          This facility has no registered city/district. Add location in{" "}
          <Link className="font-semibold text-teal-800" to="/app/settings">
            Settings
          </Link>{" "}
          before searching pharmacies.
        </div>
      )}

      <Card className="p-5">
        <h2 className="font-display text-2xl">Search medicines</h2>
        <p className="text-sm text-ink-soft">Search by name, brand, generic, strength, or dosage form.</p>
        <div className="relative mt-4 max-w-xl">
          <Input
            label="Medicine"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Paracetamol 650 mg"
            autoComplete="off"
            id="medicine"
          />
          {(searching || hits.length > 0 || (q.length >= 2 && !searching)) && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-line bg-paper-2 shadow-card">
              {searching && <p className="p-3 text-sm text-ink-soft">Searching…</p>}
              {!searching && q.length >= 2 && !hits.length && <p className="p-3 text-sm text-ink-soft">No medicine found in verified pharmacy catalogues.</p>}
              {hits.map((m) => (
                <button
                  key={lineKey(m)}
                  type="button"
                  className="flex w-full flex-col items-start border-b border-line px-3 py-2 text-left last:border-0 hover:bg-paper"
                  onClick={() => addMedicine(m)}
                >
                  <span className="font-semibold">
                    {m.name} {m.strength}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {m.genericName || "—"} · {m.dosageForm || "—"} · {m.brandName || "—"} · {m.availability}
                    {m.prescriptionRequired ? " · Prescription / authorization may be required" : ""}
                  </span>
                  <span className="mt-1 text-xs font-semibold text-teal-800">Add to requirement</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Requirement</h2>
            <p className="text-sm text-ink-soft">{cart.length} medicine(s) · total quantity {summary}</p>
          </div>
          <Button variant="outline" type="button" onClick={() => document.getElementById("medicine")?.focus() || window.scrollTo({ top: 0, behavior: "smooth" })}>
            + Add another medicine
          </Button>
        </div>
        {!cart.length ? (
          <EmptyState title="No medicines added" body="Search above and add items your facility needs." />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-soft">
                  <th className="py-2">Medicine</th>
                  <th>Generic</th>
                  <th>Strength</th>
                  <th>Form</th>
                  <th>Quantity</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cart.map((it, i) => (
                  <tr key={lineKey(it)} className="border-t border-line">
                    <td className="py-2 font-semibold">
                      {it.name}
                      {it.prescriptionRequired && (
                        <div className="text-xs font-normal text-ink-soft">Prescription / authorization required</div>
                      )}
                    </td>
                    <td>{it.genericName || "—"}</td>
                    <td>{it.strength || "—"}</td>
                    <td>{it.dosageForm || "—"}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="outline" className="min-h-8 px-2" onClick={() => setQty(i, it.requestedQty - 1)}>
                          −
                        </Button>
                        <input
                          className="h-9 w-16 rounded-lg border border-line px-2 text-center"
                          type="number"
                          min={1}
                          value={it.requestedQty}
                          onChange={(e) => setQty(i, e.target.value)}
                        />
                        <Button type="button" variant="outline" className="min-h-8 px-2" onClick={() => setQty(i, it.requestedQty + 1)}>
                          +
                        </Button>
                      </div>
                    </td>
                    <td>
                      <input
                        className="min-h-9 w-40 rounded-lg border border-line px-2"
                        placeholder="Optional"
                        value={it.notes || ""}
                        onChange={(e) => setCart((prev) => prev.map((x, idx) => (idx === i ? { ...x, notes: e.target.value } : x)))}
                      />
                    </td>
                    <td>
                      <button type="button" className="text-sm text-danger" onClick={() => setCart((prev) => prev.filter((_, idx) => idx !== i))}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 max-w-xl space-y-3">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Request notes</span>
            <textarea
              className="min-h-[88px] w-full rounded-xl border border-line bg-paper-2 px-3 py-2"
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Required for inpatient use · Urgent requirement · Please deliver before 5 PM"
            />
            <span className="mt-1 block text-xs text-ink-soft">Do not include patient names, MRN, or diagnoses.</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={urgency === "URGENT"} onChange={(e) => setUrgency(e.target.checked ? "URGENT" : "NORMAL")} />
            Mark as urgent
          </label>
        </div>
        <Button className="mt-4" disabled={!cart.length || finding} onClick={() => findPharmacies(false)}>
          {finding ? "Searching…" : "Find available pharmacies"}
        </Button>
      </Card>

      {found && (
        <div className="space-y-6">
          {found.emptyLocal && (
            <EmptyState
              title="No registered pharmacy is currently available in your area."
              body={`Searching from ${found.origin?.city || "your city"}, ${found.origin?.district || "your district"}.`}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => findPharmacies(true)}>
                    Search nearby areas
                  </Button>
                  <Button variant="outline" onClick={() => setAreaOpen(true)}>
                    Request pharmacy registration
                  </Button>
                </div>
              }
            />
          )}
          {nearby && (found.nearbyCities?.length || found.nearbyDistricts?.length) ? (
            <p className="text-sm text-ink-soft">
              Nearby cities: {(found.nearbyCities || []).join(", ") || "—"}. Nearby districts: {(found.nearbyDistricts || []).join(", ") || "—"}.
            </p>
          ) : null}
          <PharmacyGroup title="Available near you" rows={groups.AVAILABLE_NEAR_YOU} selected={selected} setSelected={setSelected} onDetails={openDetails} onPlace={placeOrder} placing={placing} />
          <PharmacyGroup title="Same district — other cities" rows={groups.SAME_DISTRICT} selected={selected} setSelected={setSelected} onDetails={openDetails} onPlace={placeOrder} placing={placing} />
          <PharmacyGroup title="Nearby areas" rows={groups.NEARBY} selected={selected} setSelected={setSelected} onDetails={openDetails} onPlace={placeOrder} placing={placing} />
          {nearby && <PharmacyGroup title="Other registered pharmacies" rows={groups.OTHER} selected={selected} setSelected={setSelected} onDetails={openDetails} onPlace={placeOrder} placing={placing} />}
          {!found.emptyLocal && !found.total && (
            <EmptyState title="No verified pharmacies are currently listed" body="You can request pharmacy registration for this area." action={<Button onClick={() => setAreaOpen(true)}>Request pharmacy registration</Button>} />
          )}
          {selected.length > 0 && (
            <Card className="p-5">
              <p className="text-sm">
                Request will be sent to {selected.length} pharmacy(ies). This is not a confirmed order.
              </p>
              <Button className="mt-3" disabled={sending} onClick={send}>
                {sending ? "Sending…" : "Send medicine request"}
              </Button>
            </Card>
          )}
        </div>
      )}

      <Modal
        open={!!detail}
        onClose={closeDetails}
        title="Pharmacy details"
        footer={
          detail ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={placing || !canOrderLines(detail.lines)}
                onClick={() => placeOrder(detail.pharmacy, detail.lines, fulfillmentPick)}
              >
                {placing ? "Placing order…" : "Request medicines"}
              </Button>
              {detail.pharmacy.contactNumber ? (
                <a
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-semibold"
                  href={`tel:${detail.pharmacy.contactNumber}`}
                >
                  Call pharmacy
                </a>
              ) : (
                <Button type="button" variant="outline" disabled>
                  Call pharmacy
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={closeDetails}>
                Close
              </Button>
            </div>
          ) : null
        }
      >
        {detail && (
          <PharmacyDetailsBody
            detail={detail}
            fulfillmentPick={fulfillmentPick}
            setFulfillmentPick={setFulfillmentPick}
          />
        )}
      </Modal>

      <Modal open={areaOpen} onClose={() => setAreaOpen(false)} title="Request pharmacy registration" footer={
        <>
          <Button variant="ghost" onClick={() => setAreaOpen(false)}>Cancel</Button>
          <Button onClick={requestArea}>Submit request</Button>
        </>
      }>
        <p className="text-sm text-ink-soft">We need a pharmacy/medical shop in this area. Network administrators can follow up from this interest record.</p>
        <textarea className="mt-3 min-h-[88px] w-full rounded-xl border border-line px-3 py-2" value={areaNotes} onChange={(e) => setAreaNotes(e.target.value)} />
      </Modal>
    </div>
  );
}

function PharmacyDetailsBody({ detail, fulfillmentPick, setFulfillmentPick }) {
  const p = detail.pharmacy || {};
  const address = [p.address, p.city, p.district, p.state, p.pin].filter(Boolean).join(", ");
  const distance =
    p.distanceKm != null
      ? `${p.distanceKm} km`
      : p.locationLabel || "";
  return (
    <div className="space-y-5 text-sm">
      {detail.loading && <p className="text-ink-soft">Updating availability…</p>}
      {detail.error && (
        <p className="text-danger">
          {detail.error} Showing the information already available for this pharmacy.
        </p>
      )}
      <section>
        <p className="text-xs font-semibold tracking-[0.16em] text-ink-soft uppercase">Pharmacy information</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{p.name || "Pharmacy"}</p>
          {p.verified ? <Badge tone="ok">✓ Verified pharmacy</Badge> : null}
        </div>
        <p className="mt-2 text-ink">{address || "Address not listed"}</p>
        {distance ? (
          <p className="mt-1 text-ink-soft">
            {p.distanceKm != null ? `Distance: ${p.distanceKm} km` : p.locationLabel}
          </p>
        ) : null}
      </section>
      <section>
        <p className="text-xs font-semibold tracking-[0.16em] text-ink-soft uppercase">Operating information</p>
        <p className="mt-2">Hours: {p.operatingHours || "Hours not listed"}</p>
        <p>Delivery: {p.deliveryAvailable ? "Available" : "Not available"}</p>
        <p>Pickup: {p.pickupAvailable !== false ? "Available" : "Not available"}</p>
      </section>
      <section>
        <p className="text-xs font-semibold tracking-[0.16em] text-ink-soft uppercase">Fulfillment</p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="fulfillment"
              checked={fulfillmentPick === "PICKUP"}
              disabled={detail.pharmacy.pickupAvailable === false}
              onChange={() => setFulfillmentPick("PICKUP")}
            />
            Pickup
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="fulfillment"
              checked={fulfillmentPick === "DELIVERY"}
              disabled={!detail.pharmacy.deliveryAvailable}
              onChange={() => setFulfillmentPick("DELIVERY")}
            />
            Delivery
          </label>
        </div>
      </section>
      <section>
        <p className="text-xs font-semibold tracking-[0.16em] text-ink-soft uppercase">Medicine availability</p>
        {detail.lines?.length ? (
          <ul className="mt-2 space-y-3">
            {detail.lines.map((l) => {
              const ok = l.status && l.status !== "UNAVAILABLE";
              return (
                <li key={`${l.name}|${l.strength}|${l.dosageForm}`} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <p className="font-semibold text-ink">
                    {l.name} {l.strength || ""}
                  </p>
                  <p className={ok ? "text-teal-800" : "text-ink-soft"}>
                    {ok ? "✓ Available" : "Not available"}
                    {ok && l.status === "PARTIAL" ? " (partial quantity)" : ""}
                  </p>
                  {ok && l.availableQty != null && <p className="text-ink-soft">Available quantity: {l.availableQty}</p>}
                  {l.prescriptionRequired ? <p className="text-ink-soft">Prescription / authorization required</p> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-ink-soft">No medicine lines for the current requirement.</p>
        )}
      </section>
    </div>
  );
}

function PharmacyGroup({ title, rows, selected, setSelected, onDetails, onPlace, placing }) {
  if (!rows?.length) return null;
  return (
    <div>
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {rows.map(({ pharmacy, lines }) => {
          const available = lines.filter((l) => l.status !== "UNAVAILABLE").length;
          return (
            <Card key={pharmacy._id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{pharmacy.name}</p>
                  {pharmacy.verified && <Badge tone="ok">✓ Verified pharmacy</Badge>}
                </div>
                {pharmacy.rank === 1 && <Badge>Same city</Badge>}
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {pharmacy.city}, {pharmacy.district || pharmacy.state}
                {pharmacy.distanceKm != null ? ` · Distance: ${pharmacy.distanceKm} km` : ` · ${pharmacy.locationLabel}`}
              </p>
              <p className="text-sm">
                Available medicines: {available}/{pharmacy.requestedMedicines}
              </p>
              <p className="text-sm">
                Delivery: {pharmacy.deliveryAvailable ? "Available" : "Not available"} · Pickup: {pharmacy.pickupAvailable ? "Available" : "Not available"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => onDetails(pharmacy, lines)}>
                  View details
                </Button>
                <Button
                  type="button"
                  disabled={placing || !canOrderLines(lines)}
                  onClick={() => onPlace(pharmacy, lines, pharmacy.deliveryAvailable ? "DELIVERY" : "PICKUP")}
                >
                  {placing ? "Placing…" : canOrderLines(lines) ? "Request medicines" : "Not available"}
                </Button>
                {pharmacy.contactNumber && (
                  <a className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold" href={`tel:${pharmacy.contactNumber}`}>
                    Call pharmacy
                  </a>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
