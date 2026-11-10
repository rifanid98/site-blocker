// Focus mode: when it is active, and whether the user's rules apply right now.
//
// State: { scope, manualOn, schedules, ranges }
//   scope      "always" (rules always apply, today's behaviour), "focus" (rules apply only while focus mode is active)
//              or "off" (no rule applies at all)
//   manualOn   started with one click; stays on until the user turns it off
//   schedules  weekly: { id, days: [0..6 with 0 = Sunday], start: "HH:MM", end: "HH:MM" }; end before start means overnight
//   ranges     one time: { id, start, end } as epoch milliseconds

export const FOCUS_SCOPES = ["always", "focus", "off"];

// How strict each scope is. Moving to a looser one weakens your own rules, so it needs the password.
const STRICTNESS = { off: 0, focus: 1, always: 2 };

/** The stricter of two scopes. */
export function strictest(a, b) {
  return STRICTNESS[a] >= STRICTNESS[b] ? a : b;
}

/** True when going from one scope to another makes blocking looser. Throws on an unknown scope. */
export function needsPasswordToChange(from, to) {
  if (!(from in STRICTNESS) || !(to in STRICTNESS)) throw new Error(`Unknown scope '${!(from in STRICTNESS) ? from : to}'.`);
  return STRICTNESS[to] < STRICTNESS[from];
}
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "09:30" becomes 570 (minutes after midnight). Anything that is not a 24-hour HH:MM becomes null. */
export function parseTime(text) {
  const match = typeof text === "string" ? TIME_PATTERN.exec(text) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Validates and normalizes a weekly schedule (days sorted and unique). Throws on the first problem. */
export function validateSchedule(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose days and times for the schedule.");

  const { days, start, end } = input;
  if (!Array.isArray(days) || days.length === 0) throw new Error("Choose at least one day.");
  if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("Days must be whole numbers from 0 (Sunday) to 6 (Saturday).");

  const from = parseTime(start);
  const to = parseTime(end);
  if (from === null || to === null) throw new Error("Times must look like 09:00 (24-hour).");
  if (from === to) throw new Error("The start and end time cannot be the same.");

  return { days: [...new Set(days)].sort((a, b) => a - b), start, end };
}

const pad = (number) => String(number).padStart(2, "0");

/** "2026-11-09" in the user's local time, the value a date picker uses. */
export function toDateInput(millis) {
  const date = new Date(millis);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "14:05" in the user's local time, the value a time picker uses. */
export function toTimeInput(millis) {
  const date = new Date(millis);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A date picker value ("2026-11-09") and a time picker value ("14:30") as local epoch milliseconds, or NaN. */
export function combineDateTime(date, time) {
  const match = typeof date === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  const minutes = parseTime(time);
  if (!match || minutes === null) return NaN;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const result = new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  // new Date rolls 30 February over into March, so check that the date survived as typed
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) return NaN;
  return result.getTime();
}

/** Pre-filled values for a new one-time range: from the next five minutes, for an hour. */
export function defaultRange(now = new Date()) {
  const start = new Date(now);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + ((5 - (start.getMinutes() % 5)) % 5));
  const end = new Date(start.getTime() + 3_600_000);

  return {
    startDate: toDateInput(start.getTime()),
    startTime: toTimeInput(start.getTime()),
    endDate: toDateInput(end.getTime()),
    endTime: toTimeInput(end.getTime()),
  };
}

/** Validates a one-time range of epoch milliseconds. Throws on the first problem. */
export function validateRange(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose a start and an end time.");

  const { start, end } = input;
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Choose a start and an end time.");
  if (end <= start) throw new Error("The end must be after the start.");

  return { start, end };
}

function scheduleActive(schedule, now) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const from = parseTime(schedule.start);
  const to = parseTime(schedule.end);
  const today = now.getDay();
  const yesterday = (today + 6) % 7;

  if (from < to) return schedule.days.includes(today) && minutes >= from && minutes < to;

  // Overnight: the evening part belongs to today, the morning part to a schedule that started yesterday.
  return (schedule.days.includes(today) && minutes >= from) || (schedule.days.includes(yesterday) && minutes < to);
}

function rangeActive(range, now) {
  const time = now.getTime();
  return time >= range.start && time < range.end;
}

/** What is keeping focus mode on right now, in the order: manual, schedules, ranges. */
export function activeSources(focus, now = new Date()) {
  const sources = [];
  if (focus.manualOn) sources.push({ type: "manual" });
  for (const schedule of focus.schedules) if (scheduleActive(schedule, now)) sources.push({ type: "schedule", schedule });
  for (const range of focus.ranges) if (rangeActive(range, now)) sources.push({ type: "range", range });
  return sources;
}

export function isFocusActive(focus, now = new Date()) {
  return activeSources(focus, now).length > 0;
}

/** Whether the user's rules (blocking, and every mode) are enforced right now. */
export function rulesApplyNow(focus, now = new Date()) {
  if (focus.scope === "always") return true;
  if (focus.scope === "off") return false;
  return isFocusActive(focus, now);
}

function describeSource(source) {
  if (source.type === "manual") return "started by you";
  if (source.type === "schedule") {
    const { days, start, end } = source.schedule;
    return `schedule ${days.map((day) => DAY_NAMES[day]).join(", ")} ${start}-${end}`;
  }
  return `until ${new Date(source.range.end).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
}

/** One plain sentence about the current state, for the options page and the popup. */
export function focusStatusText(focus, now = new Date()) {
  if (focus.scope === "off") return "Blocking is off. Your rules are not applied.";
  if (focus.scope === "always") {
    return "Your rules always apply, so focus mode has no effect. Choose \"On, only during focus mode\" to use it.";
  }

  const sources = activeSources(focus, now);
  if (sources.length === 0) return "Focus mode is off. Your rules are not applied right now.";
  return `Focus mode is on (${sources.map(describeSource).join("; ")}). Your rules are applied.`;
}
