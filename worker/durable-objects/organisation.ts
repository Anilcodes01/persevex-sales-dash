import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";
import { AUTH_SCHEMA } from "../storage/schema";
import { TEAM_SCHEMA } from "../storage/team-schema";
import { SALES_SCHEMA } from "../storage/sales-schema";
import { AuthStore } from "../storage/auth-store";
import { HttpError, json } from "../http/helpers";
import { routeOrganisationRequest } from "../routes/router";
import { SalesLive } from "../realtime/sales-live";
import { migrateMonthlyTargets } from "../storage/target-periods";
import { TARGET_SCHEMA } from "../storage/targets-store";
import { PAYMENT_SCHEMA, recordPayment } from "../payments/payment-store";
import type { CashfreePayment } from "../payments/cashfree-webhook";
import { migrateSalesCountTargets } from "../storage/sales-count-targets";

// The coordinator owns persistent storage; route modules implement its APIs.
export class Organisation extends DurableObject<Env> {
  private readonly authStore: AuthStore;
  private readonly salesLive: SalesLive;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.transactionSync(() => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS app_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO app_metadata (key, value) VALUES (?, ?)",
        "schema_version",
        "1",
      );
      for (const statement of AUTH_SCHEMA) ctx.storage.sql.exec(statement);
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS account_avatars (account_id TEXT PRIMARY KEY REFERENCES accounts(id), object_key TEXT NOT NULL)");
      for (const statement of TEAM_SCHEMA) ctx.storage.sql.exec(statement);
      const columns = ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(accounts)")
        .toArray();
      if (!columns.some((column) => column.name === "job_role")) {
        ctx.storage.sql.exec(
          "ALTER TABLE accounts ADD COLUMN job_role TEXT NOT NULL DEFAULT 'employee'",
        );
        ctx.storage.sql.exec("UPDATE accounts SET job_role = role");
      }
      ctx.storage.sql.exec(
        "UPDATE app_metadata SET value = '4' WHERE key = 'schema_version' AND value IN ('1', '2', '3')",
      );
      for (const statement of SALES_SCHEMA) ctx.storage.sql.exec(statement);
      const saleColumns = ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(sales)")
        .toArray();
      if (!saleColumns.some((column) => column.name === "overall_amount_paise"))
        ctx.storage.sql.exec(
          "ALTER TABLE sales ADD COLUMN overall_amount_paise INTEGER CHECK(overall_amount_paise IS NULL OR overall_amount_paise >= amount_paise)",
        );
      for (const statement of TARGET_SCHEMA) ctx.storage.sql.exec(statement);
      ctx.storage.sql.exec(
        "UPDATE app_metadata SET value = '5' WHERE key = 'schema_version' AND value = '4'",
      );
      ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('sales_version', '0')",
      );
      ctx.storage.sql.exec(
        "UPDATE app_metadata SET value='6' WHERE key='schema_version' AND value='5'",
      );
      migrateMonthlyTargets(ctx.storage);
      migrateSalesCountTargets(ctx.storage);
      for (const statement of PAYMENT_SCHEMA) ctx.storage.sql.exec(statement);
      ctx.storage.sql.exec(
        "UPDATE app_metadata SET value='9' WHERE key='schema_version' AND value='8'",
      );
      const paymentColumns = ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(cashfree_payments)")
        .toArray();
      if (!paymentColumns.some((column) => column.name === "verified"))
        ctx.storage.sql.exec(
          "ALTER TABLE cashfree_payments ADD COLUMN verified INTEGER NOT NULL DEFAULT 1 CHECK(verified IN (0,1))",
        );
      ctx.storage.sql.exec(
        "UPDATE app_metadata SET value='10' WHERE key='schema_version' AND value='9'",
      );
      ctx.storage.sql.exec(
        "UPDATE app_metadata SET value='11' WHERE key='schema_version' AND value='10'",
      );
    });
    this.authStore = new AuthStore(ctx.storage);
    this.salesLive = new SalesLive(ctx, this.authStore);
    this.authStore.onSalesChanged = (change) => {
      try {
        this.salesLive.publish(change);
      } catch {
        // A notification failure must not turn a committed sale into a failed receipt.
        // Closing sockets forces authoritative recovery on their next connection.
        for (const socket of ctx.getWebSockets()) {
          try {
            socket.close(1011, "Reconnect to sync");
          } catch {
            /* Already closed. */
          }
        }
      }
    };
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  // Internal RPC only; no ledger data is exposed by this foundation.
  async receiveCashfree(payment: CashfreePayment) {
    if (!this.env.CASHFREE_ENV || payment.environment !== this.env.CASHFREE_ENV)
      throw new HttpError(503, "Payment environment not configured");
    const result = await recordPayment(payment, this.authStore);
    if (!result.duplicate) {
      try {
        this.salesLive.publishPayments(result.version, result.inserted === true);
      } catch {
        // A failed notification must not fail a durably committed payment.
        for (const socket of this.ctx.getWebSockets()) {
          try {
            socket.close(1011, "Reconnect to sync");
          } catch {
            /* Already closed. */
          }
        }
      }
    }
    return { duplicate: result.duplicate };
  }
  health() {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>(
        "SELECT value FROM app_metadata WHERE key = ?",
        "schema_version",
      )
      .one();
    return { storage: "sqlite", schemaVersion: Number(row.value) };
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      if (path === "/api/employee/sales/live" && request.method === "GET")
        return await this.salesLive.connect(request, this.env);
      const response = await routeOrganisationRequest(
        request,
        this.authStore,
        this.env,
      );
      if (
        response.ok &&
        request.method === "POST" &&
        [
          "/api/admin/clear-development-data",
          "/api/auth/logout",
          "/api/auth/login",
          "/api/auth/password",
          "/api/admin/accounts/update",
          "/api/admin/accounts/disable",
          "/api/admin/accounts/reset-password",
          "/api/admin/teams/save",
          "/api/admin/teams/delete",
          "/api/admin/teams/assign",
        ].includes(path)
      )
        this.salesLive.refreshAccess();
      return response;
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      // Never log passwords, tokens, or request bodies.
      return json({ error: "Service unavailable. Please try again." }, 503);
    }
  }
  async alarm() {
    await this.salesLive.alarm();
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    this.salesLive.message(socket, message);
  }
  webSocketClose(socket: WebSocket) {
    this.salesLive.closed(socket);
  }
  webSocketError(socket: WebSocket) {
    this.salesLive.closed(socket);
  }
}
