// Extiende la interfaz Env auto-generada por wrangler con los secrets de Google y Spotify.
// Declaration merging: TypeScript une esta declaración con la de worker-configuration.d.ts.
declare interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  SPOTIFY_REFRESH_TOKEN: string;
}
