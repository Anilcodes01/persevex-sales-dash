import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";
import { AUTH_SCHEMA } from "../storage/schema";
import { TEAM_SCHEMA } from "../storage/team-schema";
import { AuthStore } from "../storage/auth-store";
import { HttpError, json } from "../http/helpers";
import { routeOrganisationRequest } from "../routes/router";

// The coordinator owns persistent storage; route modules implement its APIs.
export class Organisation extends DurableObject<Env> {
  private readonly authStore: AuthStore;

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
      for (const statement of TEAM_SCHEMA) ctx.storage.sql.exec(statement);
      ctx.storage.sql.exec(
        "UPDATE app_metadata SET value = '3' WHERE key = 'schema_version' AND value IN ('1', '2')",
      );
    });
    this.authStore = new AuthStore(ctx.storage);
  }

  // Internal RPC only; no ledger data is exposed by this foundation.
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
      return await routeOrganisationRequest(request, this.authStore, this.env);
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      // Never log passwords, tokens, or request bodies.
      return json({ error: "Service unavailable. Please try again." }, 503);
    }
  }
}
