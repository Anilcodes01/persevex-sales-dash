import type { Env } from "../types";

export function isAllowedRequestOrigin(request: Request, env: Env) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin === url.origin) return true;
  // Next forwards the browser's Origin unchanged. Only the loopback dev runtime
  // accepts its explicitly configured frontend origin; production stays strict.
  return (
    env.LOCAL_DEVELOPMENT === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    Boolean(env.DEV_FRONTEND_ORIGIN) &&
    origin === env.DEV_FRONTEND_ORIGIN
  );
}
