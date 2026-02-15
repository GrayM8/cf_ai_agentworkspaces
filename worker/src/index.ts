export { Room } from "./room";

export interface Env {
  ROOM: DurableObjectNamespace;
  AI: Ai;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Upgrade",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return new Response("EdgeRooms worker is running.", {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // Route: /ws/:roomId
    const wsMatch = url.pathname.match(/^\/ws\/([a-zA-Z0-9_-]{1,64})$/);
    if (wsMatch) {
      const roomId = wsMatch[1];
      const id = env.ROOM.idFromName(roomId);
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
} satisfies ExportedHandler<Env>;
