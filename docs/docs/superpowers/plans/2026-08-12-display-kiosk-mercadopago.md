# Display Kiosk MercadoPago — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forkear display-kiosk y agregar widgets de Gmail y Google Calendar para un POS Android en el escritorio de trabajo.

**Architecture:** Un Cloudflare Worker sirve el frontend React (heredado del fork) y expone `/api/gmail` y `/api/calendar` como nuevos endpoints proxy con cache. Los widgets usan el hook `useWidgetData` existente para polling y manejo de errores. La autenticación con Google se hace vía OAuth2 refresh token guardado como Cloudflare secret.

**Tech Stack:** React 18 + Vite + TypeScript, Cloudflare Workers, Gmail API v1, Google Calendar API v3, OAuth2 refresh token flow.

## Global Constraints

- Node 20+ requerido
- El repo base es `NicolasRocchia/display-kiosk` — seguir sus convenciones: `WidgetFrame` para wrapper, `useWidgetData` para polling, sources en `worker/sources/`
- Orientación objetivo: landscape (horizontal)
- Timezone: `America/Argentina/Buenos_Aires`
- No modificar `worker-configuration.d.ts` — es auto-generado por wrangler
- Secrets de Google van en Cloudflare secrets (nunca en `wrangler.jsonc`)

---

### Task 1: Fork, clone y verificar baseline

**Files:**
- Ninguno (setup)

**Interfaces:**
- Produces: repo local corriendo en `http://localhost:5173` con clima y reloj funcionando

- [ ] **Step 1: Forkear el repo**

  En GitHub: `https://github.com/NicolasRocchia/display-kiosk` → Fork → nombre sugerido: `display-kiosk-mp`

- [ ] **Step 2: Clonar y verificar**

```bash
git clone https://github.com/TU_USUARIO/display-kiosk-mp.git
cd display-kiosk-mp
npm install
npm run dev
```

  Abrir `http://localhost:5173` — debe verse el display con clima real y reloj funcionando.

- [ ] **Step 3: Commit inicial de identidad**

```bash
git commit --allow-empty -m "chore: fork from NicolasRocchia/display-kiosk"
```

---

### Task 2: Extender tipos compartidos

**Files:**
- Modify: `shared/api-types.ts` (agregar `GmailData`, `CalendarData`, `GmailMessage`, `CalendarEvent`; extender `SourceId`)
- Create: `worker/env-secrets.d.ts` (declarar secrets de Google en `Env` vía declaration merging)

**Interfaces:**
- Produces:
  - `GmailMessage { id, threadId, from, subject, date }`
  - `GmailData { unreadCount, unread: GmailMessage[], starred: GmailMessage[] }`
  - `CalendarEvent { id, summary, start, end, isAllDay }`
  - `CalendarData { today: CalendarEvent[], nextUp: CalendarEvent | null, tomorrow: CalendarEvent[] }`
  - `Env.GOOGLE_CLIENT_ID`, `Env.GOOGLE_CLIENT_SECRET`, `Env.GOOGLE_REFRESH_TOKEN`

- [ ] **Step 1: Agregar tipos a `shared/api-types.ts`**

  Al final del archivo (después de `ServicesData`), agregar:

```typescript
export interface GmailMessage {
  id: string;
  threadId: string;
  /** Nombre del remitente (sin la dirección) */
  from: string;
  subject: string;
  date: string;
}

export interface GmailData {
  unreadCount: number;
  /** Últimos 4 emails no leídos del inbox */
  unread: GmailMessage[];
  /** Últimos 4 emails destacados (starred) */
  starred: GmailMessage[];
}

export interface CalendarEvent {
  id: string;
  summary: string;
  /** ISO 8601 con zona, o "YYYY-MM-DD" si isAllDay */
  start: string;
  end: string;
  isAllDay: boolean;
}

export interface CalendarData {
  /** Todos los eventos de hoy (incluyendo pasados) */
  today: CalendarEvent[];
  /** Próximo evento que aún no terminó; null si no hay más hoy */
  nextUp: CalendarEvent | null;
  /** Primeros 3 eventos de mañana (solo si today está vacío) */
  tomorrow: CalendarEvent[];
}
```

  Y extender la unión `SourceId`:

```typescript
// Línea existente:
export type SourceId = "solar" | "weather" | "services";
// Cambiar a:
export type SourceId = "solar" | "weather" | "services" | "gmail" | "calendar";
```

- [ ] **Step 2: Crear `worker/env-secrets.d.ts`**

```typescript
// Extiende la interfaz Env auto-generada por wrangler con los secrets de Google.
// Declaration merging: TypeScript une esta declaración con la de worker-configuration.d.ts.
declare interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
}
```

- [ ] **Step 3: Verificar que TypeScript no reporta errores**

```bash
npx tsc --noEmit
```

  Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add shared/api-types.ts worker/env-secrets.d.ts
git commit -m "feat: add Gmail and Calendar types to shared API contract"
```

---

### Task 3: Google OAuth token refresh helper

**Files:**
- Create: `worker/sources/googleAuth.ts`

**Interfaces:**
- Produces: `getAccessToken(env: Env): Promise<string>`
  - Usa `env.GOOGLE_CLIENT_ID`, `env.GOOGLE_CLIENT_SECRET`, `env.GOOGLE_REFRESH_TOKEN`
  - Cachea el access token en memoria hasta 60s antes de que expire
  - Lanza `Error` si el refresh falla (el Worker lo atrapa y sirve datos viejos del cache)

- [ ] **Step 1: Crear `worker/sources/googleAuth.ts`**

```typescript
interface TokenCache {
  accessToken: string;
  /** ms timestamp de expiración */
  expiresAt: number;
}

let cache: TokenCache | null = null;

export async function getAccessToken(env: Env): Promise<string> {
  const now = Date.now();
  // Reusar si quedan más de 60s de vida
  if (cache && cache.expiresAt > now + 60_000) return cache.accessToken;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) throw new Error(`Google token refresh HTTP ${res.status}`);

  const data = await res.json<{ access_token: string; expires_in: number }>();
  cache = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cache.accessToken;
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add worker/sources/googleAuth.ts
git commit -m "feat: add Google OAuth2 access token refresh helper"
```

---

### Task 4: Fuente de Gmail

**Files:**
- Create: `worker/sources/gmail.ts`

**Interfaces:**
- Consumes: `getAccessToken(env)` de `./googleAuth`
- Produces: `fetchGmail(env: Env): Promise<GmailData>`
- API calls:
  - `GET /gmail/v1/users/me/labels/INBOX` → `messagesUnread`
  - `GET /gmail/v1/users/me/messages?labelIds=INBOX&q=is:unread&maxResults=4`
  - `GET /gmail/v1/users/me/messages?labelIds=STARRED&maxResults=4`
  - Por cada mensaje: `GET /gmail/v1/users/me/messages/{id}?format=metadata&metadataHeaders=From,Subject,Date`

- [ ] **Step 1: Crear `worker/sources/gmail.ts`**

```typescript
import type { GmailData, GmailMessage } from "../../shared/api-types";
import { getAccessToken } from "./googleAuth";

const TIMEOUT_MS = 8_000;
const MAX_MESSAGES = 4;
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function fetchGmail(env: Env): Promise<GmailData> {
  const token = await getAccessToken(env);
  const h = { Authorization: `Bearer ${token}` };

  const [labelRes, unreadListRes, starredListRes] = await Promise.all([
    fetch(`${BASE}/labels/INBOX`, { headers: h, signal: AbortSignal.timeout(TIMEOUT_MS) }),
    fetch(`${BASE}/messages?labelIds=INBOX&q=is%3Aunread&maxResults=${MAX_MESSAGES}`, {
      headers: h,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
    fetch(`${BASE}/messages?labelIds=STARRED&maxResults=${MAX_MESSAGES}`, {
      headers: h,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  ]);

  if (!labelRes.ok) throw new Error(`Gmail INBOX label HTTP ${labelRes.status}`);
  if (!unreadListRes.ok) throw new Error(`Gmail unread list HTTP ${unreadListRes.status}`);
  if (!starredListRes.ok) throw new Error(`Gmail starred list HTTP ${starredListRes.status}`);

  const [label, unreadList, starredList] = await Promise.all([
    labelRes.json<{ messagesUnread: number }>(),
    unreadListRes.json<{ messages?: { id: string; threadId: string }[] }>(),
    starredListRes.json<{ messages?: { id: string; threadId: string }[] }>(),
  ]);

  const [unread, starred] = await Promise.all([
    fetchDetails(unreadList.messages ?? [], token),
    fetchDetails(starredList.messages ?? [], token),
  ]);

  return { unreadCount: label.messagesUnread ?? 0, unread, starred };
}

async function fetchDetails(
  msgs: { id: string; threadId: string }[],
  token: string,
): Promise<GmailMessage[]> {
  if (msgs.length === 0) return [];
  const h = { Authorization: `Bearer ${token}` };
  const details = await Promise.all(
    msgs.map((m) =>
      fetch(
        `${BASE}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: h, signal: AbortSignal.timeout(TIMEOUT_MS) },
      ).then((r) => {
        if (!r.ok) throw new Error(`Gmail message HTTP ${r.status}`);
        return r.json<GmailMessageRaw>();
      }),
    ),
  );
  return details.map(parseMessage);
}

interface GmailMessageRaw {
  id: string;
  threadId: string;
  payload: { headers: { name: string; value: string }[] };
}

function parseMessage(raw: GmailMessageRaw): GmailMessage {
  const get = (name: string) =>
    raw.payload.headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  const rawFrom = get("from");
  // "Nombre Apellido <email@empresa.com>" → "Nombre Apellido"
  const from = rawFrom.replace(/<[^>]+>/, "").trim() || rawFrom;
  return {
    id: raw.id,
    threadId: raw.threadId,
    from,
    subject: get("subject") || "(sin asunto)",
    date: get("date"),
  };
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add worker/sources/gmail.ts
git commit -m "feat: add Gmail API source (unread count + starred emails)"
```

---

### Task 5: Fuente de Google Calendar

**Files:**
- Create: `worker/sources/calendar.ts`

**Interfaces:**
- Consumes: `getAccessToken(env)` de `./googleAuth`; `env.TIMEZONE`
- Produces: `fetchCalendar(env: Env): Promise<CalendarData>`
- API call: `GET /calendar/v3/calendars/primary/events` con `timeMin`/`timeMax` en UTC correspondiente a medianoche BsAs

- [ ] **Step 1: Crear `worker/sources/calendar.ts`**

```typescript
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
  const utcMidnight = new Date(dateStr + "T00:00:00.000Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(utcMidnight);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  // Restar horas/minutos para que la hora local sea 00:00
  return new Date(utcMidnight.getTime() - (h * 60 + m) * 60_000).toISOString();
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add worker/sources/calendar.ts
git commit -m "feat: add Google Calendar source (today's events + next up)"
```

---

### Task 6: Registrar nuevas fuentes en el Worker

**Files:**
- Modify: `worker/sources/index.ts`

**Interfaces:**
- Consumes: `fetchGmail` de `./gmail`, `fetchCalendar` de `./calendar`, `GmailData`, `CalendarData` de `../../shared/api-types`
- Produces: `/api/gmail` y `/api/calendar` disponibles como endpoints del Worker

- [ ] **Step 1: Modificar `worker/sources/index.ts`**

  Agregar imports:

```typescript
import { fetchGmail } from "./gmail";
import { fetchCalendar } from "./calendar";
import type { GmailData, CalendarData } from "../../shared/api-types";
```

  Agregar entradas al objeto `sources` (después de `services`):

```typescript
gmail: { id: "gmail", ttlSeconds: 120, fetch: fetchGmail } satisfies Source<GmailData>,
calendar: { id: "calendar", ttlSeconds: 300, fetch: fetchCalendar } satisfies Source<CalendarData>,
```

- [ ] **Step 2: Verificar tipos y regenerar definiciones**

```bash
npx tsc --noEmit
npm run cf-typegen
```

- [ ] **Step 3: Commit**

```bash
git add worker/sources/index.ts worker-configuration.d.ts
git commit -m "feat: register gmail and calendar sources in Worker"
```

---

### Task 7: Widget de Gmail

**Files:**
- Create: `src/widgets/GmailWidget.tsx`

**Interfaces:**
- Consumes: `useWidgetData<GmailData>('/api/gmail', 120_000)`, `WidgetFrame`, `GmailData` de `../../shared/api-types`
- Produces: `GmailWidget` React component; CSS classes `gmail`, `gmail__count`, `gmail__unread-number`, `gmail__unread-label`, `gmail__list`, `gmail__item`, `gmail__from`, `gmail__subject`, `gmail__divider`

- [ ] **Step 1: Crear `src/widgets/GmailWidget.tsx`**

```tsx
import type { GmailData } from '../../shared/api-types'
import { WidgetFrame } from '../components/WidgetFrame'
import { useWidgetData } from '../hooks/useWidgetData'

const POLL_MS = 2 * 60 * 1000

export function GmailWidget() {
  const { data, status, updatedAt, errorMessage } = useWidgetData<GmailData>(
    '/api/gmail',
    POLL_MS,
  )

  return (
    <WidgetFrame title="Gmail" status={status} updatedAt={updatedAt} errorMessage={errorMessage}>
      {data && (
        <div className="gmail">
          <div className="gmail__count">
            <span className="gmail__unread-number">{data.unreadCount}</span>
            <span className="gmail__unread-label">no leídos</span>
          </div>

          {data.unread.length > 0 && (
            <ul className="gmail__list">
              {data.unread.map((msg) => (
                <li key={msg.id} className="gmail__item">
                  <span className="gmail__from">{msg.from}</span>
                  <span className="gmail__subject">{msg.subject}</span>
                </li>
              ))}
            </ul>
          )}

          {data.starred.length > 0 && (
            <>
              <div className="gmail__divider">★ Destacados</div>
              <ul className="gmail__list">
                {data.starred.map((msg) => (
                  <li key={msg.id} className="gmail__item">
                    <span className="gmail__from">{msg.from}</span>
                    <span className="gmail__subject">{msg.subject}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {data.unreadCount === 0 && data.starred.length === 0 && (
            <p className="widget__note">Inbox vacío</p>
          )}
        </div>
      )}
    </WidgetFrame>
  )
}
```

- [ ] **Step 2: Agregar CSS del widget al final de `src/theme.css`**

```css
/* ---- Gmail widget ---- */

.gmail {
  display: flex;
  flex-direction: column;
  gap: 1vmin;
  overflow: hidden;
}

.gmail__count {
  display: flex;
  align-items: baseline;
  gap: 0.8vmin;
}

.gmail__unread-number {
  font-size: 6vmin;
  font-weight: 600;
  line-height: 1;
  color: var(--ink);
}

.gmail__unread-label {
  font-size: 1.6vmin;
  color: var(--ink-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.gmail__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5vmin;
}

.gmail__item {
  display: flex;
  flex-direction: column;
  gap: 0.1vmin;
  overflow: hidden;
}

.gmail__from {
  font-size: 1.5vmin;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gmail__subject {
  font-size: 1.4vmin;
  color: var(--ink-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gmail__divider {
  font-size: 1.3vmin;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding-top: 0.5vmin;
  border-top: 1px solid var(--hairline);
}
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/widgets/GmailWidget.tsx src/theme.css
git commit -m "feat: add GmailWidget (unread count + starred)"
```

---

### Task 8: Widget de Calendar

**Files:**
- Create: `src/widgets/CalendarWidget.tsx`

**Interfaces:**
- Consumes: `useWidgetData<CalendarData>('/api/calendar', 300_000)`, `WidgetFrame`, `CalendarData` de `../../shared/api-types`
- Produces: `CalendarWidget` React component; CSS classes `calendar`, `calendar__event`, `calendar__event--next`, `calendar__event--tomorrow`, `calendar__time`, `calendar__summary`, `calendar__countdown`, `calendar__section-label`

- [ ] **Step 1: Crear `src/widgets/CalendarWidget.tsx`**

```tsx
import type { CalendarData, CalendarEvent } from '../../shared/api-types'
import { WidgetFrame } from '../components/WidgetFrame'
import { useWidgetData } from '../hooks/useWidgetData'

const POLL_MS = 5 * 60 * 1000

function formatTime(iso: string, allDay: boolean): string {
  if (allDay) return 'Todo el día'
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function countdownLabel(startIso: string): string | null {
  const mins = Math.round((new Date(startIso).getTime() - Date.now()) / 60_000)
  if (mins < 0) return null
  if (mins === 0) return 'ahora'
  return `en ${mins} min`
}

export function CalendarWidget() {
  const { data, status, updatedAt, errorMessage } = useWidgetData<CalendarData>(
    '/api/calendar',
    POLL_MS,
  )

  return (
    <WidgetFrame title="Hoy" status={status} updatedAt={updatedAt} errorMessage={errorMessage}>
      {data && (
        <div className="calendar">
          {data.today.length === 0 && data.tomorrow.length === 0 && (
            <p className="widget__note">Sin reuniones</p>
          )}

          {data.today.map((event: CalendarEvent) => {
            const isNext = data.nextUp?.id === event.id
            const countdown = isNext ? countdownLabel(event.start) : null
            return (
              <div
                key={event.id}
                className={`calendar__event${isNext ? ' calendar__event--next' : ''}`}
              >
                <span className="calendar__time">{formatTime(event.start, event.isAllDay)}</span>
                <span className="calendar__summary">{event.summary}</span>
                {countdown && <span className="calendar__countdown">{countdown}</span>}
              </div>
            )
          })}

          {data.today.length === 0 && data.tomorrow.length > 0 && (
            <>
              <div className="calendar__section-label">Mañana</div>
              {data.tomorrow.map((event: CalendarEvent) => (
                <div key={event.id} className="calendar__event calendar__event--tomorrow">
                  <span className="calendar__time">{formatTime(event.start, event.isAllDay)}</span>
                  <span className="calendar__summary">{event.summary}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </WidgetFrame>
  )
}
```

- [ ] **Step 2: Agregar CSS al final de `src/theme.css`**

```css
/* ---- Calendar widget ---- */

.calendar {
  display: flex;
  flex-direction: column;
  gap: 1vmin;
  overflow: hidden;
}

.calendar__section-label {
  font-size: 1.3vmin;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.calendar__event {
  display: grid;
  grid-template-columns: 7vmin 1fr auto;
  align-items: center;
  gap: 1vmin;
  padding: 0.6vmin 0;
  border-bottom: 1px solid var(--hairline);
}

.calendar__event:last-child {
  border-bottom: none;
}

.calendar__event--next {
  border-left: 2px solid var(--status-good);
  padding-left: 1vmin;
}

.calendar__event--tomorrow {
  opacity: 0.55;
}

.calendar__time {
  font-size: 1.6vmin;
  color: var(--ink-muted);
  font-variant-numeric: tabular-nums;
}

.calendar__summary {
  font-size: 1.7vmin;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.calendar__countdown {
  font-size: 1.4vmin;
  color: var(--status-good);
  white-space: nowrap;
}
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/widgets/CalendarWidget.tsx src/theme.css
git commit -m "feat: add CalendarWidget (today's events + countdown)"
```

---

### Task 9: Actualizar registry y grilla de layout

**Files:**
- Modify: `src/widgets/registry.ts` (quitar `SolarWidget`, agregar `GmailWidget` y `CalendarWidget`; actualizar tipo `area`)
- Modify: `src/theme.css` (landscape grid con 4 áreas: weather, clock, gmail, calendar + fila services)

**Interfaces:**
- Consumes: `GmailWidget` de `./GmailWidget`, `CalendarWidget` de `./CalendarWidget`
- Produces: display con nuevo layout en landscape

- [ ] **Step 1: Reemplazar `src/widgets/registry.ts`**

```typescript
import type { ComponentType } from 'react'
import { CalendarWidget } from './CalendarWidget'
import { ClockWidget } from './ClockWidget'
import { GmailWidget } from './GmailWidget'
import { ServicesWidget } from './ServicesWidget'
import { WeatherWidget } from './WeatherWidget'

export interface WidgetDescriptor {
  id: string
  area: 'clock' | 'weather' | 'gmail' | 'calendar' | 'services'
  Component: ComponentType
}

export const registry: WidgetDescriptor[] = [
  { id: 'clock', area: 'clock', Component: ClockWidget },
  { id: 'weather', area: 'weather', Component: WeatherWidget },
  { id: 'calendar', area: 'calendar', Component: CalendarWidget },
  { id: 'gmail', area: 'gmail', Component: GmailWidget },
  { id: 'services', area: 'services', Component: ServicesWidget },
]
```

- [ ] **Step 2: Actualizar la grilla landscape en `src/theme.css`**

  Reemplazar el bloque `@media (orientation: landscape)` existente:

```css
/* Apaisado: clima | calendario | gmail; reloj debajo de calendario; services como franja */
@media (orientation: landscape) {
  .dashboard {
    grid-template-areas:
      "weather calendar gmail"
      "weather clock    gmail"
      "services services services";
    grid-template-columns: 1.1fr 1fr 0.9fr;
    grid-template-rows: 1.3fr 1fr auto;
  }
}
```

  Y el bloque `@media (orientation: portrait)`:

```css
@media (orientation: portrait) {
  .dashboard {
    grid-template-areas:
      "clock"
      "weather"
      "calendar"
      "gmail"
      "services";
    grid-template-rows: auto 1fr 1fr 1fr auto;
  }
}
```

- [ ] **Step 3: Verificar tipos y abrir en browser**

```bash
npx tsc --noEmit
npm run dev
```

  Abrir `http://localhost:5173` — debe verse el nuevo layout con los 4 widgets (gmail y calendar mostrarán error/sin datos hasta configurar credenciales).

- [ ] **Step 4: Commit**

```bash
git add src/widgets/registry.ts src/theme.css
git commit -m "feat: update widget registry and landscape grid layout"
```

---

### Task 10: Script de setup OAuth y dev vars

**Files:**
- Create: `scripts/get-google-token.mjs`
- Modify: `.dev.vars.example` (agregar las 3 variables de Google)

**Interfaces:**
- Produces: script ejecutable que abre el browser, recibe el callback OAuth y imprime el refresh token listo para copiar a wrangler secrets

- [ ] **Step 1: Crear `scripts/get-google-token.mjs`**

```javascript
#!/usr/bin/env node
// Obtiene un refresh token de Google OAuth2 para Gmail + Calendar (solo lectura).
// Uso: GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-google-token.mjs

import { createServer } from 'http';
import { execSync } from 'child_process';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Uso: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-google-token.mjs');
  process.exit(1);
}

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent'); // fuerza refresh_token aunque ya autorizaste antes

const url = authUrl.toString();
console.log('\nAbriendo browser para autorizar...');
try {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  execSync(`${cmd} "${url}"`);
} catch {
  console.log('No se pudo abrir el browser. Visitá esta URL manualmente:');
  console.log(url);
}

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith('/callback')) { res.end(); return; }

  const code = new URL(req.url, 'http://localhost:3000').searchParams.get('code');
  if (!code) { res.writeHead(400); res.end('Sin code en callback'); return; }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>Autorizado. Podés cerrar esta pestaña.</h1>');
  server.close();

  if (tokens.refresh_token) {
    console.log('\n✅ Listo. Corré estos comandos (pegá el valor cuando te lo pida):\n');
    console.log('npx wrangler secret put GOOGLE_CLIENT_ID');
    console.log(`  → ${CLIENT_ID}\n`);
    console.log('npx wrangler secret put GOOGLE_CLIENT_SECRET');
    console.log(`  → ${CLIENT_SECRET}\n`);
    console.log('npx wrangler secret put GOOGLE_REFRESH_TOKEN');
    console.log(`  → ${tokens.refresh_token}\n`);
    console.log('Para desarrollo local, agregá esos valores a .dev.vars');
  } else {
    console.error('\n❌ No se recibió refresh_token:', JSON.stringify(tokens, null, 2));
    console.error('Asegurate de que el tipo de app OAuth sea "Desktop app" en Google Cloud Console.');
  }
});

server.listen(3000, () => {
  console.log('Esperando callback en http://localhost:3000/callback...\n');
});
```

- [ ] **Step 2: Agregar Google vars a `.dev.vars.example`**

  Abrir `.dev.vars.example` y agregar al final:

```
# Google OAuth2 (solo lectura: Gmail + Calendar)
# Obtener con: node scripts/get-google-token.mjs
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
```

- [ ] **Step 3: Commit**

```bash
git add scripts/get-google-token.mjs .dev.vars.example
git commit -m "feat: add Google OAuth setup script and dev vars template"
```

---

### Task 11: Configurar credenciales y verificar en local

**Files:**
- Create: `.dev.vars` (gitignoreado — nunca commitear)

**Interfaces:**
- Consumes: credenciales Google obtenidas con el script del Task 10
- Produces: display completo funcionando en `http://localhost:5173` con datos reales de Gmail y Calendar

**Prerequisitos antes de este task:**
1. Tener una cuenta en [Google Cloud Console](https://console.cloud.google.com)
2. Crear proyecto → habilitar "Gmail API" y "Google Calendar API"
3. Crear credencial OAuth2 tipo **"Desktop app"** → descargar client_id y client_secret

- [ ] **Step 1: Obtener refresh token**

```bash
GOOGLE_CLIENT_ID=tu_client_id GOOGLE_CLIENT_SECRET=tu_client_secret node scripts/get-google-token.mjs
```

  Autorizar en el browser con tu cuenta MercadoPago. El script imprime los 3 valores.

- [ ] **Step 2: Crear `.dev.vars` (verificar que está en .gitignore)**

```bash
grep "dev.vars" .gitignore  # debe estar listado
cp .dev.vars.example .dev.vars
```

  Completar `.dev.vars` con los 3 valores impresos por el script.

- [ ] **Step 3: Correr el dev server y verificar**

```bash
npm run dev
```

  Abrir `http://localhost:5173`. Verificar:
  - Widget Gmail: muestra el contador real de no leídos
  - Widget Calendar: muestra las reuniones del día
  - Widget Clima: sigue funcionando
  - Widget Reloj: sigue funcionando

  Para verificar los endpoints directamente:
  ```bash
  curl http://localhost:5173/api/gmail | python3 -m json.tool
  curl http://localhost:5173/api/calendar | python3 -m json.tool
  ```

---

### Task 12: Deploy a Cloudflare y configurar Fully Kiosk

**Files:**
- Ninguno (operaciones de deploy y configuración del POS)

- [ ] **Step 1: Cargar secrets en Cloudflare**

```bash
npx wrangler login  # solo si no estás logueado
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
```

- [ ] **Step 2: Actualizar `wrangler.jsonc` con tus URLs de monitoreo (opcional)**

  Editar la variable `MONITOR_URLS` para incluir Worqio API y Railway:

```jsonc
"MONITOR_URLS": "[{\"name\":\"Worqio API\",\"url\":\"https://TU_URL_RAILWAY/health\"},{\"name\":\"Claude\",\"url\":\"https://status.anthropic.com/api/v2/status.json\",\"type\":\"statuspage\"}]"
```

- [ ] **Step 3: Deploy**

```bash
npm run deploy
```

  Anota la URL `https://display-kiosk-mp.TU_SUBDOMINIO.workers.dev`

- [ ] **Step 4: Configurar Fully Kiosk Browser en el POS**

  1. Instalar [Fully Kiosk Browser](https://play.google.com/store/apps/details?id=de.ozerov.fully) desde Play Store
  2. **Start URL**: `https://display-kiosk-mp.TU_SUBDOMINIO.workers.dev`
  3. Activar: **Keep Screen On**, **Launch on Boot**, **Restart after Crash**
  4. En *Web Content Settings*: activar **Auto Reload on Error**
  5. Activar modo fullscreen / immersive
  6. Si el POS no abre la URL: ir a Ajustes → Conexión → DNS privado → `dns.google`

- [ ] **Step 5: Verificar en el POS**

  El display debe mostrar los 4 widgets en landscape. Si el POS tiene pantalla AMOLED, el fondo negro apaga los píxeles y reduce el consumo.
