#!/usr/bin/env node
// Obtiene un refresh token de Spotify (lectura + control de reproducción).
// Uso: SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node scripts/get-spotify-token.mjs

import { createServer } from 'http';
import { execSync } from 'child_process';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Uso: SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/get-spotify-token.mjs');
  process.exit(1);
}

// Nota: "http://localhost:3000/callback" tiene que estar agregado como Redirect URI
// en la app de https://developer.spotify.com/dashboard (Settings → Redirect URIs).
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ');

const authUrl = new URL('https://accounts.spotify.com/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);

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

  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      code,
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
    console.log('npx wrangler secret put SPOTIFY_CLIENT_ID');
    console.log(`  → ${CLIENT_ID}\n`);
    console.log('npx wrangler secret put SPOTIFY_CLIENT_SECRET');
    console.log(`  → ${CLIENT_SECRET}\n`);
    console.log('npx wrangler secret put SPOTIFY_REFRESH_TOKEN');
    console.log(`  → ${tokens.refresh_token}\n`);
    console.log('Para desarrollo local, agregá esos valores a .dev.vars');
  } else {
    console.error('\n❌ No se recibió refresh_token:', JSON.stringify(tokens, null, 2));
    console.error('Verificá que "http://localhost:3000/callback" esté en los Redirect URIs de la app.');
  }
});

server.listen(3000, () => {
  console.log('Esperando callback en http://localhost:3000/callback...\n');
});
