export const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const SHORT = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatClock(hhmm) {
  if (!hhmm) return "—";
  const [h, m] = String(hhmm).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function slotLines(blocks) {
  const lines = [];
  for (const b of blocks || []) {
    const range = `${formatClock(b.start)}–${formatClock(b.end)}`;
    if (b.date) {
      lines.push(`${String(b.date).slice(0, 10)} — ${range}`);
      continue;
    }
    for (const d of b.days || []) {
      lines.push(`${SHORT[d] || "Day"} — ${range}`);
    }
  }
  return lines;
}

export function flattenBlocks(blocks) {
  const slots = [];
  for (const b of blocks || []) {
    if (b.date) {
      slots.push({ day: "1", date: String(b.date).slice(0, 10), start: b.start, end: b.end });
      continue;
    }
    for (const day of b.days || []) {
      slots.push({ day: String(day), date: "", start: b.start, end: b.end });
    }
  }
  return slots.length ? slots : [{ day: "1", date: "", start: "09:00", end: "13:00" }];
}

export function slotsToBlocks(slots) {
  return slots
    .filter((s) => s.start && s.end && (s.date || s.day !== ""))
    .map((s) =>
      s.date
        ? { date: s.date, days: [], start: s.start, end: s.end, durationMinutes: 15 }
        : { days: [Number(s.day)], start: s.start, end: s.end, durationMinutes: 15 }
    );
}
