import type { Account } from "../types";
import { HttpError } from "../http/helpers";
import type { SaleChange } from "../realtime/sales-live";

// Shared storage operations run inside the organisation Durable Object.
export class AuthStore {
  onSalesChanged?: (change: SaleChange) => void;
  constructor(public readonly storage: DurableObjectStorage) {}

  accountForSession(tokenHash: string): Account {
    const row = this.storage.sql
      .exec<Account>(
        `SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id
       WHERE s.token_hash = ? AND s.expires_at > ? AND a.active = 1`,
        tokenHash,
        Date.now(),
      )
      .toArray()[0];
    if (!row) throw new HttpError(401, "Please sign in");
    return row;
  }

  audit(actor: string, action: string, subject: string) {
    this.storage.sql.exec(
      "INSERT INTO auth_audit VALUES (?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      actor,
      action,
      subject,
      Date.now(),
    );
  }

  limit(key: string, maximum: number) {
    const now = Date.now();
    this.storage.sql.exec(
      "DELETE FROM auth_rate_limits WHERE expires_at <= ?",
      now,
    );
    const row = this.storage.sql
      .exec<{ count: number }>(
        "SELECT count FROM auth_rate_limits WHERE key = ?",
        key,
      )
      .toArray()[0];
    if (row && row.count >= maximum)
      throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
    this.storage.sql.exec(
      `INSERT INTO auth_rate_limits VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET count = count + 1`,
      key,
      now + 15 * 60 * 1000,
    );
  }
}
