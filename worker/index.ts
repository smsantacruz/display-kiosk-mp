import type { ApiErr, ApiOk, SpotifyAction } from "../shared/api-types";
import { cachedFetch } from "./cache";
import { CameraRelay } from "./cameraRelay";
import { isKnownSource, sources, type Source } from "./sources";
import { sendSpotifyCommand } from "./sources/spotify";

const SPOTIFY_ACTIONS: readonly SpotifyAction[] = ["play", "pause", "next", "previous"];

export { CameraRelay };

// El TTL vive solo en el Worker: el cliente siempre ve ageSeconds veraz.
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function err(source: string, code: string, message: string): ApiErr {
  return { ok: false, source, error: { code, message }, data: null };
}

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;

    // Link corto para el visor de cámara: evita tener que escribir/pegar el token a mano.
    if (path === "/cam") {
      const url = new URL("/camera.html", request.url);
      if (env.CAMERA_RELAY_TOKEN) url.searchParams.set("token", env.CAMERA_RELAY_TOKEN);
      return Response.redirect(url.toString(), 302);
    }

    // Con assets.run_worker_first: ["/api/*", "/cam"], todo lo demás lo sirve la capa de assets.
    if (!path.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    if (path === "/api/health") {
      return json({ ok: true, now: new Date().toISOString() });
    }

    if (path === "/api/camera/publish" || path === "/api/camera/view") {
      const url = new URL(request.url);
      if (!env.CAMERA_RELAY_TOKEN || url.searchParams.get("token") !== env.CAMERA_RELAY_TOKEN) {
        return new Response("unauthorized", { status: 401 });
      }
      const role = path.endsWith("publish") ? "publisher" : "viewer";
      const stub = env.CAMERA_RELAY.get(env.CAMERA_RELAY.idFromName("default"));
      const relayUrl = new URL(request.url);
      relayUrl.searchParams.set("role", role);
      return stub.fetch(new Request(relayUrl, request));
    }

    if (path.startsWith("/api/spotify/") && request.method === "POST") {
      const action = path.slice("/api/spotify/".length) as SpotifyAction;
      if (!SPOTIFY_ACTIONS.includes(action)) {
        return json(err("spotify", "UNKNOWN_ACTION", `Acción desconocida: ${action}`), 404);
      }
      try {
        await sendSpotifyCommand(env, action);
        return json({ ok: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return json(err("spotify", "UPSTREAM_ERROR", message), 502);
      }
    }

    const id = path.slice("/api/".length);
    if (!isKnownSource(id)) {
      return json(err(id, "UNKNOWN_SOURCE", `Fuente desconocida: ${id}`), 404);
    }

    const source: Source<unknown> = sources[id];
    try {
      const r = await cachedFetch(source.id, source.ttlSeconds, () => source.fetch(env));
      const body: ApiOk<unknown> = {
        ok: true,
        source: source.id,
        updatedAt: new Date(r.updatedAt).toISOString(),
        ageSeconds: Math.round((Date.now() - r.updatedAt) / 1000),
        stale: r.stale,
        data: r.data,
      };
      return json(body);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return json(err(source.id, "UPSTREAM_ERROR", message), 502);
    }
  },
} satisfies ExportedHandler<Env>;
