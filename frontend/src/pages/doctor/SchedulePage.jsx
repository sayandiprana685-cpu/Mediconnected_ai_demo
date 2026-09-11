import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi.js";
import { api } from "../../services/api.js";
import { Button, Card, EmptyState, Input } from "../../components/ui/index.jsx";
import { useToast } from "../../components/ui/Toast.jsx";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const blank = { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00", breakStart: "13:00", breakEnd: "13:30", durationMinutes: 15, online: false };

export default function SchedulePage() {
  const { data, reload, facilityId, error } = useApi("/api/doctors/schedule");
  const toast = useToast();
  const [blocks, setBlocks] = useState([blank]);
  const [unavailable, setUnavailable] = useState("");

  useEffect(() => {
    if (data?.schedule?.blocks?.length) setBlocks(data.schedule.blocks);
    if (data?.schedule?.unavailableDates?.length) {
      setUnavailable(data.schedule.unavailableDates.map((d) => String(d).slice(0, 10)).join(", "));
    }
  }, [data]);

  function toggleDay(i, day) {
    setBlocks((prev) =>
      prev.map((b, n) => {
        if (n !== i) return b;
        const has = b.days.includes(day);
        return { ...b, days: has ? b.days.filter((d) => d !== day) : [...b.days, day].sort() };
      })
    );
  }

  async function save(e) {
    e.preventDefault();
    try {
      await api("/api/doctors/schedule", {
        method: "PUT",
        facilityId,
        body: {
          blocks,
          unavailableDates: unavailable
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      toast("Schedule saved for this facility.");
      reload();
    } catch (err) {
      toast(err.message, "danger");
    }
  }

  if (error) return <p className="text-danger">{error}</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-4xl">Schedule</h1>
      <p className="text-ink-soft">Working hours apply only to the facility currently selected in the header.</p>
      <form className="mt-6 space-y-4" onSubmit={save}>
        {blocks.map((b, i) => (
          <Card key={i} className="space-y-4 p-5">
            <p className="text-xs tracking-widest text-ink-soft uppercase">Block {i + 1}</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((label, day) => (
                <button
                  type="button"
                  key={day}
                  className={`min-h-10 rounded-full px-3 text-sm ${b.days.includes(day) ? "bg-teal-900 text-white" : "border border-line"}`}
                  onClick={() => toggleDay(i, day)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Start" type="time" value={b.start} onChange={(e) => setBlocks(blocks.map((x, n) => (n === i ? { ...x, start: e.target.value } : x)))} />
              <Input label="End" type="time" value={b.end} onChange={(e) => setBlocks(blocks.map((x, n) => (n === i ? { ...x, end: e.target.value } : x)))} />
              <Input label="Break start" type="time" value={b.breakStart || ""} onChange={(e) => setBlocks(blocks.map((x, n) => (n === i ? { ...x, breakStart: e.target.value } : x)))} />
              <Input label="Break end" type="time" value={b.breakEnd || ""} onChange={(e) => setBlocks(blocks.map((x, n) => (n === i ? { ...x, breakEnd: e.target.value } : x)))} />
              <Input
                label="Consultation duration (minutes)"
                type="number"
                value={b.durationMinutes}
                onChange={(e) => setBlocks(blocks.map((x, n) => (n === i ? { ...x, durationMinutes: Number(e.target.value) } : x)))}
              />
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={!!b.online} onChange={(e) => setBlocks(blocks.map((x, n) => (n === i ? { ...x, online: e.target.checked } : x)))} />
                Online / teleconsultation slots
              </label>
            </div>
          </Card>
        ))}
        <Button type="button" variant="ghost" onClick={() => setBlocks([...blocks, { ...blank, days: [6] }])}>
          + Add block
        </Button>
        <Input
          label="Unavailable dates (YYYY-MM-DD, comma separated)"
          value={unavailable}
          onChange={(e) => setUnavailable(e.target.value)}
          hint="Leave and blocked days. The API rejects overlapping blocks on the same weekday."
        />
        <Button type="submit">Save schedule</Button>
      </form>
      {!data?.schedule && <p className="mt-4 text-sm text-ink-soft">No saved schedule yet — defaults above are a starting point.</p>}
      {data?.schedule && !data.schedule.blocks?.length && <EmptyState title="Empty schedule" body="Add at least one working block." />}
    </div>
  );
}
