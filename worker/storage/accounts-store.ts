import { AuthStore } from "./auth-store";
import type { Account } from "../types";

export function queryAccounts(url: URL, store: AuthStore) {
  const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const status = url.searchParams.get("status") || "all";
  const role = url.searchParams.get("role") || "all";
  const requestedPage = Number(url.searchParams.get("page") || 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10000)
      : 1;
  const pageSize = 25;
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (query) {
    where.push(
      "(instr(lower(display_name), lower(?)) > 0 OR instr(email, lower(?)) > 0)",
    );
    args.push(query, query);
  }
  if (status === "active" || status === "inactive") {
    where.push("active = ?");
    args.push(status === "active" ? 1 : 0);
  }
  if (["employee", "manager", "admin"].includes(role)) {
    where.push("role = ?");
    args.push(role);
  }
  const filter = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const total = store.storage.sql
    .exec<{ count: number }>(
      `SELECT COUNT(*) AS count FROM accounts${filter}`,
      ...args,
    )
    .one().count;
  const accounts = store.storage.sql
    .exec<Omit<Account, "password_hash"> & { created_at: number }>(
      `SELECT id, email, display_name, role, active, must_change_password, created_at FROM accounts${filter}
     ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?`,
      ...args,
      pageSize,
      (page - 1) * pageSize,
    )
    .toArray();
  const stats = store.storage.sql
    .exec<{
      total: number;
      active: number;
      employees: number;
      managers: number;
    }>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(active), 0) AS active,
      COALESCE(SUM(role = 'employee'), 0) AS employees, COALESCE(SUM(role = 'manager'), 0) AS managers FROM accounts`,
    )
    .one();
  return { accounts, total, page, pageSize, stats };
}
