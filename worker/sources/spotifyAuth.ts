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

  // Spotify (a diferencia de Google) exige las credenciales de la app como Basic auth,
  // no como campos del body.
  const basicAuth = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.SPOTIFY_REFRESH_TOKEN,
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) throw new Error(`Spotify token refresh HTTP ${res.status}`);

  const data = await res.json<{ access_token: string; expires_in: number }>();
  cache = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cache.accessToken;
}
