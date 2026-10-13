import type { Env } from "./types";
import { json } from "./http/helpers";
import { isAllowedRequestOrigin } from "./security/request-origin";

// Cloudflare requires the Durable Object class to be exported from this entrypoint.
export { Organisation } from "./durable-objects/organisation";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/api/auth/") ||
      url.pathname.startsWith("/api/admin/") ||
      url.pathname.startsWith("/api/employee/") ||
      url.pathname.startsWith("/api/manager/")
    ) {
      if (request.method !== "GET" && request.method !== "POST")
        return json({ error: "Method not allowed" }, 405);
      if (request.method === "POST" && !isAllowedRequestOrigin(request, env))
        return json({ error: "Invalid request origin" }, 403);
      return env.ORGANISATION.getByName("persevex").fetch(request);
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      try {
        const organisation = env.ORGANISATION.getByName("persevex");
        const health = await organisation.health();
        return Response.json(
          { status: "ok", ...health },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch {
        return Response.json(
          { status: "unavailable" },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
