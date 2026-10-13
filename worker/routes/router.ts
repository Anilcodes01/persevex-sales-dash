import type { Env } from "../types";
import { AuthStore } from "../storage/auth-store";
import { digest, readSession, sessionCookie } from "../security/credentials";
import { HttpError, json, publicAccount, readBody } from "../http/helpers";
import { bootstrap, changePassword, login } from "./auth";
import {
  createAccount,
  disableAccount,
  resetPassword,
  listAccounts,
  updateAccount,
  enableAccount,
} from "./accounts";
import { listTeams, saveTeam, assignEmployee } from "./teams";
import { employeeTeam } from "../storage/teams-store";
import { salesContext, listSales, submitSale, reviewSale } from "./sales";
import { ownPerformance, listTargets, saveTarget } from "./targets";
import { listAdminSales } from "./admin-sales";
import { tvLeaderboard } from "./tv";
import { adminOverview } from "./overview";

// Authentication and authorisation happen here before protected handlers run.
export async function routeOrganisationRequest(
  request: Request,
  store: AuthStore,
  env: Env,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const rawToken = readSession(request);
  const tokenHash = rawToken ? await digest(rawToken) : "";

  if (path === "/api/auth/me" && request.method === "GET") {
    return json({ account: publicAccount(store.accountForSession(tokenHash)) });
  }
  if (
    request.method === "GET" &&
    ["/api/employee/performance", "/api/manager/targets"].includes(path)
  ) {
    const actor = store.accountForSession(tokenHash);
    if (actor.must_change_password)
      throw new HttpError(403, "Change your password first");
    return path === "/api/employee/performance"
      ? ownPerformance(actor, store, new URL(request.url))
      : listTargets(actor, store, new URL(request.url));
  }
  if (
    request.method === "GET" &&
    [
      "/api/employee/sales/context",
      "/api/employee/sales",
      "/api/manager/sales",
    ].includes(path)
  ) {
    const actor = store.accountForSession(tokenHash);
    if (actor.must_change_password)
      throw new HttpError(403, "Change your password first");
    if (path.endsWith("/context")) return salesContext(actor, store);
    return listSales(
      actor,
      store,
      new URL(request.url),
      path === "/api/manager/sales",
    );
  }
  if (path === "/api/manager/teams" && request.method === "GET") {
    const actor = store.accountForSession(tokenHash);
    if (
      actor.must_change_password ||
      (actor.role !== "manager" && actor.job_role !== "team_lead")
    )
      throw new HttpError(403, "Team Lead or manager access required");
    const teams = store.storage.sql
      .exec<{ id: string; name: string }>(
        "SELECT t.id, t.name FROM teams t JOIN manager_assignments m ON m.team_id = t.id WHERE m.account_id = ? AND m.ends_at IS NULL ORDER BY t.name_key",
        actor.id,
      )
      .toArray();
    return json({ teams });
  }
  if (path === "/api/employee/team" && request.method === "GET") {
    const actor = store.accountForSession(tokenHash);
    if (actor.must_change_password || actor.role !== "employee")
      throw new HttpError(403, "Employee access required");
    return json({ team: employeeTeam(actor.id, store) });
  }
  if (path === "/api/admin/teams" && request.method === "GET") {
    requireAdministrator(store.accountForSession(tokenHash));
    return listTeams(store);
  }
  if (path === "/api/admin/sales" && request.method === "GET") {
    requireAdministrator(store.accountForSession(tokenHash));
    return listAdminSales(store, new URL(request.url));
  }
  if (path === "/api/admin/tv" && request.method === "GET") {
    requireAdministrator(store.accountForSession(tokenHash));
    return tvLeaderboard(store);
  }
  if (path === "/api/admin/overview" && request.method === "GET") {
    requireAdministrator(store.accountForSession(tokenHash));
    return adminOverview(store, new URL(request.url));
  }
  if (path === "/api/admin/accounts" && request.method === "GET") {
    const actor = store.accountForSession(tokenHash);
    requireAdministrator(actor);
    return listAccounts(new URL(request.url), store);
  }
  if (request.method !== "POST") return json({ error: "Not found" }, 404);

  if (path === "/api/auth/login" || path === "/api/auth/bootstrap") {
    const ipHash = await digest(
      request.headers.get("CF-Connecting-IP") || "local",
    );
    // An office can share one public IP. Account limits remain much stricter.
    store.limit(`ip:${ipHash}`, 1000);
  }
  if (path === "/api/auth/logout") {
    store.storage.sql.exec(
      "DELETE FROM sessions WHERE token_hash = ?",
      tokenHash,
    );
    return json({ ok: true }, 200, sessionCookie("", 0));
  }

  const body = await readBody(request);
  if (path === "/api/auth/login") return login(body, store);
  if (path === "/api/auth/bootstrap") return bootstrap(body, store, env);

  const actor = store.accountForSession(tokenHash);
  store.limit(`actor:${actor.id}`, 30);
  if (path === "/api/auth/password") return changePassword(body, actor, store);
  if (path === "/api/manager/targets") {
    if (actor.must_change_password)
      throw new HttpError(403, "Change your password first");
    return saveTarget(body, actor, store);
  }
  if (["/api/employee/sales", "/api/manager/sales/review"].includes(path)) {
    if (actor.must_change_password)
      throw new HttpError(403, "Change your password first");
    if (path === "/api/employee/sales") return submitSale(body, actor, store);
    return reviewSale(body, actor, store);
  }

  requireAdministrator(actor);

  switch (path) {
    case "/api/admin/teams/save":
      return saveTeam(body, actor, store);
    case "/api/admin/teams/assign":
      return assignEmployee(body, actor, store);
    case "/api/admin/accounts":
      return createAccount(body, actor.id, store);
    case "/api/admin/accounts/disable":
      return disableAccount(body, actor, store);
    case "/api/admin/accounts/reset-password":
      return resetPassword(body, actor, store);
    case "/api/admin/accounts/update":
      return updateAccount(body, actor, store);
    case "/api/admin/accounts/enable":
      return enableAccount(body, actor, store);
    default:
      return json({ error: "Not found" }, 404);
  }
}

function requireAdministrator(actor: {
  must_change_password: number;
  role: string;
}) {
  if (actor.must_change_password)
    throw new HttpError(403, "Change your temporary password first");
  if (actor.role !== "admin")
    throw new HttpError(403, "Administrator access required");
}
