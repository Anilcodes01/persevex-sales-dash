import type { Account } from "../types";
import { AuthStore } from "../storage/auth-store";
import { HttpError, json, publicAccount } from "../http/helpers";
import {
  hashPassword,
  normaliseEmail,
  validPassword,
} from "../security/credentials";
import { queryAccounts } from "../storage/accounts-store";
import { isJobRole } from "../../shared/roles";

export function listAccounts(url: URL, store: AuthStore): Response {
  const result = queryAccounts(url, store);
  return json({
    ...result,
    accounts: result.accounts.map((account) => ({
      ...publicAccount(account),
      createdAt: account.created_at,
    })),
  });
}

export function updateAccount(
  body: Record<string, unknown>,
  actor: Account,
  store: AuthStore,
): Response {
  const email = normaliseEmail(body.email);
  const name =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const current =
    typeof body.accountId === "string"
      ? store.storage.sql
          .exec<Account>("SELECT * FROM accounts WHERE id = ?", body.accountId)
          .toArray()[0]
      : undefined;
  const jobRole = body.jobRole ?? current?.job_role ?? body.role;
  if (
    typeof body.accountId !== "string" ||
    !email ||
    !name ||
    name.length > 100 ||
    !["employee", "manager", "admin"].includes(body.role as string) ||
    !isJobRole(jobRole)
  ) {
    throw new HttpError(400, "Provide a valid name, email and role");
  }
  if (body.accountId === actor.id && body.role !== "admin")
    throw new HttpError(400, "You cannot remove your own administrator role");
  if (
    !store.storage.sql
      .exec("SELECT id FROM accounts WHERE id = ?", body.accountId)
      .toArray().length
  )
    throw new HttpError(404, "Account not found");
  if (
    store.storage.sql
      .exec(
        "SELECT id FROM accounts WHERE email = ? AND id != ?",
        email,
        body.accountId,
      )
      .toArray().length
  )
    throw new HttpError(409, "Email already has an account");
  store.storage.transactionSync(() => {
    if (body.role !== "employee")
      store.storage.sql.exec(
        "UPDATE team_memberships SET ends_at = ? WHERE account_id = ? AND ends_at IS NULL",
        Date.now(),
        body.accountId as string,
      );
    if (body.role !== "manager")
      store.storage.sql.exec(
        "UPDATE manager_assignments SET ends_at = ? WHERE account_id = ? AND ends_at IS NULL",
        Date.now(),
        body.accountId as string,
      );
    store.storage.sql.exec(
      "UPDATE accounts SET email = ?, display_name = ?, role = ?, job_role = ? WHERE id = ?",
      email,
      name,
      body.role as string,
      jobRole as string,
      body.accountId as string,
    );
    store.audit(actor.id, "account_updated", body.accountId as string);
  });
  return json({ ok: true });
}

export function enableAccount(
  body: Record<string, unknown>,
  actor: Account,
  store: AuthStore,
): Response {
  if (typeof body.accountId !== "string")
    throw new HttpError(400, "Select an account");
  if (
    !store.storage.sql
      .exec("SELECT id FROM accounts WHERE id = ?", body.accountId)
      .toArray().length
  )
    throw new HttpError(404, "Account not found");
  store.storage.transactionSync(() => {
    store.storage.sql.exec(
      "UPDATE accounts SET active = 1 WHERE id = ?",
      body.accountId as string,
    );
    store.audit(actor.id, "account_enabled", body.accountId as string);
  });
  return json({ ok: true });
}

export function createAccount(
  body: Record<string, unknown>,
  actor: string | null,
  store: AuthStore,
): Response {
  const email = normaliseEmail(body.email);
  const name =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const role = actor ? body.role : "admin";
  const jobRole = actor ? (body.jobRole ?? role) : "admin";
  if (
    !email ||
    !name ||
    name.length > 100 ||
    !validPassword(body.password) ||
    !["employee", "manager", "admin"].includes(role as string) ||
    !isJobRole(jobRole)
  )
    throw new HttpError(
      400,
      "Provide a name, email, role and a 15–128 character password",
    );
  if (
    store.storage.sql
      .exec("SELECT id FROM accounts WHERE email = ?", email)
      .toArray().length
  )
    throw new HttpError(409, "Email already has an account");
  const account: Account = {
    id: crypto.randomUUID(),
    email,
    display_name: name,
    role: role as string,
    job_role: jobRole as string,
    password_hash: hashPassword(body.password),
    active: 1,
    must_change_password: actor ? 1 : 0,
  };
  store.storage.transactionSync(() => {
    store.storage.sql.exec(
      "INSERT INTO accounts (id, email, display_name, password_hash, role, active, must_change_password, created_at, job_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      account.id,
      email,
      name,
      account.password_hash,
      account.role,
      1,
      account.must_change_password,
      Date.now(),
      account.job_role,
    );
    store.audit(actor || account.id, "account_created", account.id);
  });
  return json({ account: publicAccount(account) }, 201);
}

export function disableAccount(
  body: Record<string, unknown>,
  actor: Account,
  store: AuthStore,
): Response {
  if (typeof body.accountId !== "string" || body.accountId === actor.id)
    throw new HttpError(400, "Select another account");
  if (
    !store.storage.sql
      .exec("SELECT id FROM accounts WHERE id = ?", body.accountId)
      .toArray().length
  )
    throw new HttpError(404, "Account not found");
  store.storage.transactionSync(() => {
    store.storage.sql.exec(
      "UPDATE accounts SET active = 0 WHERE id = ?",
      body.accountId as string,
    );
    store.storage.sql.exec(
      "DELETE FROM sessions WHERE account_id = ?",
      body.accountId as string,
    );
    store.audit(actor.id, "account_disabled", body.accountId as string);
  });
  return json({ ok: true });
}

export function resetPassword(
  body: Record<string, unknown>,
  actor: Account,
  store: AuthStore,
): Response {
  if (typeof body.accountId !== "string" || !validPassword(body.password))
    throw new HttpError(
      400,
      "Account ID and a 15–128 character temporary password are required",
    );
  if (
    !store.storage.sql
      .exec("SELECT id FROM accounts WHERE id = ?", body.accountId)
      .toArray().length
  )
    throw new HttpError(404, "Account not found");
  const passwordHash = hashPassword(body.password);
  store.storage.transactionSync(() => {
    store.storage.sql.exec(
      "UPDATE accounts SET password_hash = ?, must_change_password = 1 WHERE id = ?",
      passwordHash,
      body.accountId as string,
    );
    store.storage.sql.exec(
      "DELETE FROM sessions WHERE account_id = ?",
      body.accountId as string,
    );
    store.audit(actor.id, "password_reset", body.accountId as string);
  });
  return json({ ok: true });
}
