import type { CalendarData, CalendarEvent } from "../../shared/api-types";
import { getAccessToken } from "./googleAuth";

const TIMEOUT_MS = 8_000;
const BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface GoogleEvent {
  id: string;
  summary?: string;
  status?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

export async function fetchCalendar(env: Env): Promise<CalendarData> {
  const token = await getAccessToken(env);
  const now = new Date();
  const tz = env.TIMEZONE;

  const todayStr = localDateStr(now, tz);
  const tomorrowStr = offsetDate(todayStr, 1);
  const dayAfterStr = offsetDate(todayStr, 2);

  const url = new URL(BASE);
  url.searchParams.set("timeMin", zonedMidnight(todayStr, tz));
  url.searchParams.set("timeMax", zonedMidnight(dayAfterStr, tz));
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "20");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Calendar HTTP ${res.status}`);

  const data = await res.json<{ items: GoogleEvent[] }>();
  const items = (data.items ?? []).filter((e) => e.status !== "cancelled");

  const tomorrowStart = zonedMidnight(tomorrowStr, tz);
  const todayEvents: CalendarEvent[] = [];
  const tomorrowEvents: CalendarEvent[] = [];

  for (const item of items) {
    const event = parseEvent(item);
    const startMs = new Date(event.start).getTime();
    if (startMs < new Date(tomorrowStart).getTime()) {
      todayEvents.push(event);
    } else {
      tomorrowEvents.push(event);
    }
  }

  const nowMs = Date.now();
  const nextUp = todayEvents.find((e) => new Date(e.end).getTime() > nowMs) ?? null;

  return {
    today: todayEvents,
    nextUp,
    tomorrow: tomorrowEvents.slice(0, 3),
  };
}

function parseEvent(item: GoogleEvent): CalendarEvent {
  const isAllDay = !item.start.dateTime;
  return {
    id: item.id,
    summary: item.summary ?? "(sin título)",
    start: item.start.dateTime ?? item.start.date ?? "",
    end: item.end.dateTime ?? item.end.date ?? "",
    isAllDay,
  };
}

/** "2026-08-12" en el timezone dado */
function localDateStr(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);
}

/** "2026-08-12" + N días → "2026-08-13" */
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Devuelve el ISO UTC que corresponde a medianoche del `dateStr` en el `tz` dado.
 * Ej: "2026-08-12", "America/Argentina/Buenos_Aires" → "2026-08-12T03:00:00.000Z"
 */
function zonedMidnight(dateStr: string, tz: string): string {
  // Anclar en noon UTC: para cualquier timezone razonable, noon UTC cae el mismo día local
  const noon = new Date(dateStr + "T12:00:00.000Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(noon);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  // offset local respecto a UTC en ms (negativo para UTC-N)
  const offsetMs = (h * 60 + m - 12 * 60) * 60_000;
  const utcMidnight = new Date(dateStr + "T00:00:00.000Z");
  return new Date(utcMidnight.getTime() - offsetMs).toISOString();
}
