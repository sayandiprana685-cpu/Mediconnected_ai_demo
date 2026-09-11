/** India Standard Time — no DST. Used for "today" operational metrics. */
export const APP_TZ = process.env.APP_TZ || "Asia/Kolkata";
const IST_OFFSET = "+05:30";

export function zonedYmd(date = new Date(), timeZone = APP_TZ) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function startOfDayTz(date = new Date()) {
  return new Date(`${zonedYmd(date)}${`T00:00:00.000${IST_OFFSET}`}`);
}

export function endOfDayTz(date = new Date()) {
  return new Date(`${zonedYmd(date)}${`T23:59:59.999${IST_OFFSET}`}`);
}

export function todayKey(date = new Date()) {
  return zonedYmd(date);
}

export function todayRange(date = new Date()) {
  return { $gte: startOfDayTz(date), $lte: endOfDayTz(date) };
}
