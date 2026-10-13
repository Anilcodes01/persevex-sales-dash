import type { Account, Env } from "../types";
import { AuthStore } from "../storage/auth-store";
import { HttpError, json, publicAccount } from "../http/helpers";
import { DUMMY_HASH, SESSION_SECONDS, digest, equal, hashPassword, normaliseEmail, randomToken, sessionCookie, validPassword, verifyPassword } from "../security/credentials";
import { createAccount } from "./accounts";

export async function login(body: Record<string, unknown>, store: AuthStore): Promise<Response> {
  const email = normaliseEmail(body.email);
  if (
    !email ||
    typeof body.password !== "string" ||
    body.password.length > 128 ||
    !body.password.length
  )
    throw new HttpError(400, "Enter a valid email and password");
  store.limit(`email:${await digest(email)}`, 10);
  const token = randomToken();
  const newTokenHash = await digest(token);
  const account = store.storage.sql
    .exec<Account>("SELECT * FROM accounts WHERE email = ?", email)
    .toArray()[0];
  const matches = verifyPassword(
    body.password,
    account?.password_hash || DUMMY_HASH,
  );
  if (!matches || !account?.active)
    throw new HttpError(401, "Email or password is incorrect");
  store.storage.transactionSync(() => {
    store.storage.sql.exec(
      "DELETE FROM sessions WHERE expires_at <= ?",
      Date.now(),
    );
    // Limit stored sessions per account to five, including this new session.
    store.storage.sql.exec(
      `DELETE FROM sessions WHERE token_hash IN (
      SELECT token_hash FROM sessions WHERE account_id = ? ORDER BY expires_at DESC LIMIT -1 OFFSET 4)`,
      account.id,
    );
    store.storage.sql.exec(
      "INSERT INTO sessions VALUES (?, ?, ?)",
      newTokenHash,
      account.id,
      Date.now() + SESSION_SECONDS * 1000,
    );
    store.audit(account.id, "login", account.id);
  });
  return json(
    { account: publicAccount(account) },
    200,
    sessionCookie(token),
  );
}

export function bootstrap(body: Record<string, unknown>, store: AuthStore, env: Env): Response {
  if (
    !env.BOOTSTRAP_ADMIN_SECRET ||
    typeof body.secret !== "string" ||
    !equal(body.secret, env.BOOTSTRAP_ADMIN_SECRET)
  )
    throw new HttpError(403, "Setup unavailable");
  if (
    store.storage.sql.exec("SELECT id FROM accounts LIMIT 1").toArray()
      .length
  )
    throw new HttpError(409, "Initial account already exists");
  return createAccount(body, null, store);
}

export function changePassword(body: Record<string, unknown>, actor: Account, store: AuthStore): Response {
  if (
    typeof body.currentPassword !== "string" ||
    body.currentPassword.length > 128 ||
    !validPassword(body.newPassword)
  )
    throw new HttpError(
      400,
      "Use a new password between 6 and 128 characters",
    );
  if (!verifyPassword(body.currentPassword, actor.password_hash))
    throw new HttpError(401, "Current password is incorrect");
  const passwordHash = hashPassword(body.newPassword);
  store.storage.transactionSync(() => {
    store.storage.sql.exec(
      "UPDATE accounts SET password_hash = ?, must_change_password = 0 WHERE id = ?",
      passwordHash,
      actor.id,
    );
    store.storage.sql.exec(
      "DELETE FROM sessions WHERE account_id = ?",
      actor.id,
    );
    store.audit(actor.id, "password_changed", actor.id);
  });
  return json({ ok: true }, 200, sessionCookie("", 0));
}
