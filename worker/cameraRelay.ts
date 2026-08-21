// Relays binary JPEG frames from one publisher (the Telpo) to any number of viewers (browsers),
// over WebSocket, through a single Durable Object instance so publisher and viewer — running on
// different networks with no public IP — can find each other via this one well-known relay.
export class CameraRelay implements DurableObject {
  private publisher: WebSocket | null = null;
  private viewers = new Set<WebSocket>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    if (role !== "publisher" && role !== "viewer") {
      return new Response("role must be publisher or viewer", { status: 400 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    if (role === "publisher") {
      this.publisher?.close(1000, "replaced by new publisher");
      this.publisher = server;
      server.addEventListener("message", (event) => {
        if (typeof event.data === "string") return; // ignore any text control messages
        for (const viewer of this.viewers) {
          try {
            viewer.send(event.data);
          } catch {
            this.viewers.delete(viewer);
          }
        }
      });
      server.addEventListener("close", () => {
        if (this.publisher === server) this.publisher = null;
      });
    } else {
      this.viewers.add(server);
      server.addEventListener("close", () => this.viewers.delete(server));
    }

    return new Response(null, { status: 101, webSocket: client });
  }
}
