import type { ExchangeData } from "../../shared/api-types";

const TIMEOUT_MS = 8_000;
// fetch() en Cloudflare Workers no manda User-Agent por defecto — DolarAPI/CoinGecko
// devuelven 403 sin uno (bot-protection genérica), un navegador normal sí pasa.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

interface DolarApiEntry {
  casa: string;
  compra: number;
  venta: number;
}

interface CoinbaseSpot {
  data: { amount: string };
}

// DolarAPI y Coinbase son APIs públicas sin autenticación — sin credenciales que configurar.
// Binance y CoinGecko bloquean (403) el tráfico saliente de los edges de Cloudflare
// (bloqueo por IP/ASN de datacenter, no por headers) — Coinbase no.
export async function fetchExchange(): Promise<ExchangeData> {
  const [dolares, btc] = await Promise.all([fetchDolares(), fetchBtcUsdt()]);

  const blue = dolares.find((d) => d.casa === "blue");
  const oficial = dolares.find((d) => d.casa === "oficial");
  if (!blue || !oficial) {
    throw new Error("DolarAPI no devolvió las casas blue/oficial");
  }

  return {
    dolarBlue: { compra: blue.compra, venta: blue.venta },
    dolarOficial: { compra: oficial.compra, venta: oficial.venta },
    btcUsdt: btc,
  };
}

async function fetchDolares(): Promise<DolarApiEntry[]> {
  const res = await fetch("https://dolarapi.com/v1/dolares", {
    headers: { "User-Agent": BROWSER_UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DolarAPI HTTP ${res.status}`);
  return res.json<DolarApiEntry[]>();
}

async function fetchBtcUsdt(): Promise<number> {
  const res = await fetch("https://api.coinbase.com/v2/prices/BTC-USDT/spot", {
    headers: { "User-Agent": BROWSER_UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Coinbase HTTP ${res.status}`);
  const data = await res.json<CoinbaseSpot>();
  return Number(data.data.amount);
}
