import type { AuthStore } from "../storage/auth-store";
import { digest, readSession } from "../security/credentials";
import { HttpError } from "../http/helpers";
import { isAllowedRequestOrigin } from "../security/request-origin";
import type { Env, Account } from "../types";
export type SaleChange = {
  employeeId: string;
  teamId: string;
  version: number;
};
type Attachment = {
  tokenHash: string;
  accountId: string;
  expiresAt: number;
  scope: string;
};

// Connections live in Cloudflare's hibernating socket set, never an in-memory registry.
export class SalesLive {
  constructor(
    private ctx: DurableObjectState,
    private store: AuthStore,
  ) {}
  version() {
    return Number(
      this.store.storage.sql
        .exec<{ value: string }>(
          "SELECT value FROM app_metadata WHERE key = 'sales_version'",
        )
        .one().value,
    );
  }
  private scope(actor: Account) {
    const teams = this.store.storage.sql
      .exec<{ id: string }>(
        `SELECT team_id AS id FROM manager_assignments WHERE account_id = ? AND ends_at IS NULL UNION SELECT team_id AS id FROM team_memberships WHERE account_id = ? AND ends_at IS NULL ORDER BY id`,
        actor.id,
        actor.id,
      )
      .toArray();
    return JSON.stringify([actor.role, actor.job_role, teams.map((t) => t.id)]);
  }
  async connect(request: Request, env: Env) {
    if (!isAllowedRequestOrigin(request, env))
      throw new HttpError(403, "Invalid request origin");
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      throw new HttpError(426, "WebSocket upgrade required");
    const token = readSession(request);
    const tokenHash = token ? await digest(token) : "";
    const actor = this.store.accountForSession(tokenHash);
    if (actor.must_change_password)
      throw new HttpError(403, "Change your password first");
    this.store.limit(`live:${actor.id}`, 60);
    const session = this.store.storage.sql
      .exec<{ expires_at: number }>(
        "SELECT expires_at FROM sessions WHERE token_hash = ?",
        tokenHash,
      )
      .one();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [`account:${actor.id}`]);
    server.serializeAttachment({
      tokenHash,
      accountId: actor.id,
      expiresAt: session.expires_at,
      scope: this.scope(actor),
    } satisfies Attachment);
    server.send(JSON.stringify({ type: "ready", version: this.version() }));
    await this.scheduleExpiry();
    return new Response(null, { status: 101, webSocket: client });
  }
  private valid(socket: WebSocket): Account | null {
    try {
      const attachment = socket.deserializeAttachment() as Attachment;
      const actor = this.store.accountForSession(attachment.tokenHash);
      if (actor.must_change_password) throw new Error();
      return actor;
    } catch {
      this.close(socket, 4401, "Session ended");
      return null;
    }
  }
  private close(socket: WebSocket, code: number, reason: string) {
    try {
      socket.close(code, reason);
    } catch {
      /* Already closed. */
    }
  }
  private send(socket: WebSocket, message: object) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.close(socket, 1011, "Reconnect required");
    }
  }
  publish(change: SaleChange) {
    // Query recipients once; authenticate only relevant connected accounts.
    const reviewers = this.store.storage.sql
      .exec<{ id: string }>(
        `SELECT id FROM accounts WHERE active = 1 AND (role = 'admin' OR (job_role = 'team_lead' AND id IN (SELECT account_id FROM manager_assignments WHERE ends_at IS NULL AND (team_id = ? OR team_id IN (SELECT team_id FROM team_memberships WHERE account_id = ? AND ends_at IS NULL)))))`,
        change.teamId,
        change.employeeId,
      )
      .toArray();
    const recipients = new Set([
      change.employeeId,
      ...reviewers.map((r) => r.id),
    ]);
    for (const id of recipients)
      for (const socket of this.ctx.getWebSockets(`account:${id}`)) {
        const actor = this.valid(socket);
        if (actor)
          this.send(socket, { type: "sales_changed", version: change.version });
      }
  }
  refreshAccess() {
    for (const socket of this.ctx.getWebSockets()) {
      const actor = this.valid(socket);
      if (!actor) continue;
      const attachment = socket.deserializeAttachment() as Attachment;
      const scope = this.scope(actor);
      if (scope !== attachment.scope) {
        socket.serializeAttachment({ ...attachment, scope });
        this.send(socket, { type: "access_changed", version: this.version() });
      }
    }
  }
  publishPayments(version: number) {
    const admins = this.store.storage.sql
      .exec<{ id: string }>(
        "SELECT id FROM accounts WHERE role='admin' AND active=1",
      )
      .toArray();
    for (const admin of admins)
      for (const socket of this.ctx.getWebSockets(`account:${admin.id}`)) {
        const actor = this.valid(socket);
        if (actor?.role === "admin")
          this.send(socket, { type: "payments_changed", version });
      }
  }
  async scheduleExpiry() {
    const expiries = this.ctx
      .getWebSockets()
      .filter((s) => s.readyState === 1)
      .map((s) => (s.deserializeAttachment() as Attachment).expiresAt);
    if (expiries.length)
      await this.ctx.storage.setAlarm(
        Math.max(Date.now() + 1, Math.min(...expiries)),
      );
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    this.refreshAccess();
    await this.scheduleExpiry();
  }
  message(socket: WebSocket, message: string | ArrayBuffer) {
    if (!this.valid(socket)) return;
    if (message === "sync")
      this.send(socket, { type: "ready", version: this.version() });
    else this.close(socket, 1008, "Unsupported message");
  }
  closed(socket: WebSocket) {
    this.close(socket, 1000, "Closed");
  }
}
