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
