# Display Kiosk — MercadoPago Work Dashboard

**Fecha:** 2026-08-12
**Base:** Fork de [NicolasRocchia/display-kiosk](https://github.com/NicolasRocchia/display-kiosk)
**Dispositivo:** POS Android, orientación horizontal, Fully Kiosk Browser

---

## Objetivo

Dashboard de escritorio para trabajo en MercadoPago. Muestra información de contexto laboral en tiempo real sin intervención: emails, reuniones, clima y hora.

---

## Arquitectura

```
POS Android (Fully Kiosk)  →  Cloudflare Worker  →  Open-Meteo (clima)
                                                  →  Gmail API (emails)
                                                  →  Google Calendar API (reuniones)
                                                  →  URLs configuradas (monitor)
```

Un único Cloudflare Worker hace de proxy y cache. El frontend React + Vite vive en el mismo Worker (plan gratuito, sin costo).

### Archivos nuevos respecto al repo base

**Worker (backend):**
- `worker/sources/gmail.ts` — fetch a Gmail API, cache 2 min
- `worker/sources/calendar.ts` — fetch a Calendar API, cache 5 min
- `worker/sources/googleAuth.ts` — lógica de refresh de OAuth2 access token

**Frontend:**
- `src/widgets/GmailWidget.tsx`
- `src/widgets/CalendarWidget.tsx`

**Setup:**
- `scripts/get-google-token.mjs` — script one-shot para obtener el refresh token via browser

---

## Autenticación Google (setup único)

1. Crear proyecto en Google Cloud, habilitar Gmail API y Calendar API
2. Crear credenciales OAuth2 (tipo "Desktop app")
3. Correr `node scripts/get-google-token.mjs` → abre browser → autorizar con cuenta MercadoPago → imprime el refresh token
4. Guardar como Cloudflare secrets:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put GOOGLE_REFRESH_TOKEN
   ```

**Scopes (solo lectura):**
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.readonly`

El Worker solicita un access token fresco en cada request usando el refresh token. El refresh token no vence salvo revocación manual.

---

## Widgets

### Clima (heredado del repo base)
- Temperatura actual, sensación, humedad, viento
- Mínima/máxima del día
- Pronóstico por hora y de 5 días
- Fuente: Open-Meteo (gratis, sin API key)

### Hora y fecha (heredado)
- Hora en grande, fecha, salida y puesta del sol

### Gmail
- Contador de emails no leídos en inbox
- Lista de los últimos 4 emails no leídos: remitente + asunto (truncado)
- Sección separada para emails destacados (starred)
- Si la API falla: muestra último dato con indicador "hace X min"

### Google Calendar
- Lista de reuniones de hoy con hora de inicio
- Próxima reunión resaltada con countdown ("en X min")
- Si no hay más reuniones hoy: primer evento de mañana en gris

### Monitor de servicios (heredado, opcional)
- Latencia de URLs configuradas en `wrangler.jsonc`

---

## Layout (landscape)

```
┌─────────────────┬──────────────────┬────────────────┐
│                 │                  │                │
│     CLIMA       │    CALENDARIO    │    GMAIL       │
│                 │    (hoy)         │  (no leídos)   │
│                 │                  │                │
├─────────────────┴──────────────────┤                │
│         HORA Y FECHA               │                │
│                                    │                │
└────────────────────────────────────┴────────────────┘
```

- Fondo negro puro (AMOLED, bajo consumo)
- Anti-burn-in: desplazamiento de píxeles cada 5 min (heredado)
- Tipografías en `vmin` — se adapta al tamaño del POS automáticamente

---

## Variables de entorno

| Variable | Descripción |
|---|---|
| `LATITUDE` / `LONGITUDE` | Ubicación para clima |
| `TIMEZONE` | `America/Argentina/Buenos_Aires` |
| `MONITOR_URLS` | JSON con servicios a monitorear |
| `GOOGLE_CLIENT_ID` | OAuth2 client ID (secret) |
| `GOOGLE_CLIENT_SECRET` | OAuth2 client secret (secret) |
| `GOOGLE_REFRESH_TOKEN` | Refresh token (secret) |

---

## Fuera de scope (por ahora)

- Trello / tareas pendientes
- Slack / mensajes
- Notificaciones push al POS
- Soporte multi-cuenta Google

---

## Costos

Con el plan gratuito de Cloudflare, costo = $0:
- ~4.500 requests/día al Worker (muy por debajo del límite de 100.000)
- Gmail y Calendar API: gratuitas dentro de cuotas estándar (muy holgadas para uso personal)
