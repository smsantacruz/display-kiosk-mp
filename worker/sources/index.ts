import type { CalendarData, ExchangeData, GmailData, ServicesData, SolarData, SourceId, WeatherData } from "../../shared/api-types";
import { fetchCalendar } from "./calendar";
import { fetchExchange } from "./exchange";
import { fetchGmail } from "./gmail";
import { fetchServices } from "./services";
import { fetchSolar } from "./solax";
import { fetchWeather } from "./weather";

export interface Source<T> {
  id: SourceId;
  ttlSeconds: number;
  fetch: (env: Env) => Promise<T>;
}

// Agregar una fuente nueva = un archivo en worker/sources/ + una entrada acá.
export const sources = {
  solar: { id: "solar", ttlSeconds: 60, fetch: fetchSolar } satisfies Source<SolarData>,
  weather: { id: "weather", ttlSeconds: 600, fetch: fetchWeather } satisfies Source<WeatherData>,
  services: { id: "services", ttlSeconds: 60, fetch: fetchServices } satisfies Source<ServicesData>,
  gmail: { id: "gmail", ttlSeconds: 120, fetch: fetchGmail } satisfies Source<GmailData>,
  calendar: { id: "calendar", ttlSeconds: 300, fetch: fetchCalendar } satisfies Source<CalendarData>,
  exchange: { id: "exchange", ttlSeconds: 300, fetch: fetchExchange } satisfies Source<ExchangeData>,
} as const;

export type KnownSourceId = keyof typeof sources;

export function isKnownSource(id: string): id is KnownSourceId {
  return id in sources;
}
