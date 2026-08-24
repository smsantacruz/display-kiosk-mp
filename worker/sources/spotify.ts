import type { SpotifyAction, SpotifyData } from "../../shared/api-types";
import { getAccessToken } from "./spotifyAuth";

const TIMEOUT_MS = 8_000;

interface SpotifyPlaybackState {
  is_playing: boolean;
  progress_ms: number | null;
  item: {
    name: string;
    artists: { name: string }[];
    album: { images: { url: string }[] };
    duration_ms: number;
  } | null;
  device: { id: string } | null;
}

const EMPTY: SpotifyData = {
  isPlaying: false,
  trackName: "",
  artistName: "",
  albumArtUrl: null,
  progressMs: 0,
  durationMs: 0,
};

// Spotify Web API — solo control remoto: estos endpoints mandan comandos al dispositivo que ya
// esté activo en Spotify Connect (celular, parlante, etc.), nunca reproducen audio en este Worker
// ni en el kiosk. Devuelve el estado "nada sonando" en vez de tirar error: es un estado normal,
// no una falla del upstream.
export async function fetchSpotify(env: Env): Promise<SpotifyData> {
  const token = await getAccessToken(env);
  const res = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (res.status === 204) return EMPTY; // nada reproduciéndose / sin dispositivo activo
  if (!res.ok) throw new Error(`Spotify HTTP ${res.status}`);

  const state = await res.json<SpotifyPlaybackState>();
  if (!state.item) return EMPTY;

  return {
    isPlaying: state.is_playing,
    trackName: state.item.name,
    artistName: state.item.artists.map((a) => a.name).join(", "),
    albumArtUrl: state.item.album.images[0]?.url ?? null,
    progressMs: state.progress_ms ?? 0,
    durationMs: state.item.duration_ms,
  };
}

const ACTION_ENDPOINT: Record<SpotifyAction, { method: string; path: string }> = {
  play: { method: "PUT", path: "play" },
  pause: { method: "PUT", path: "pause" },
  next: { method: "POST", path: "next" },
  previous: { method: "POST", path: "previous" },
};

export async function sendSpotifyCommand(env: Env, action: SpotifyAction): Promise<void> {
  const token = await getAccessToken(env);

  // Sin device_id explícito, Spotify a veces aplica el comando al dispositivo "activo" que
  // *él* decide, que no siempre coincide con el que realmente está sonando cuando hay más de
  // uno conectado — confirmado en la práctica: pause devolvía 200 sin pausar nada.
  const stateRes = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const deviceId =
    stateRes.status === 200
      ? (await stateRes.json<SpotifyPlaybackState>()).device?.id ?? null
      : null;

  const { method, path } = ACTION_ENDPOINT[action];
  const url = new URL(`https://api.spotify.com/v1/me/player/${path}`);
  if (deviceId) url.searchParams.set("device_id", deviceId);

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // 404 = no hay dispositivo activo en Spotify Connect ahora mismo — normal, no es un bug.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Spotify command ${action} HTTP ${res.status}`);
  }
}
