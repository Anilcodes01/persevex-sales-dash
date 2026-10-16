import type { AuthStore } from "../storage/auth-store";
import { requestedRange } from "../storage/target-periods";
import { json } from "../http/helpers";
import { recentPayments } from "../payments/payment-store";
import type { Env } from "../types";

export function tvLeaderboard(store: AuthStore, env: Env) {
  const range = requestedRange({});
  const countTargets = new Map(
    store.storage.sql
      .exec<{ accountId: string; count: number }>(
        "SELECT account_id AS accountId,target_count AS count FROM period_targets WHERE basis='sales_count' AND from_date=? AND to_date=?",
        range.from,
        range.to,
      )
      .toArray()
      .map((row) => [row.accountId, row.count]),
  );
  const teamPeople = store.storage.sql
    .exec<{ teamId: string; accountId: string }>(
      `
    SELECT team_id AS teamId,account_id AS accountId FROM team_memberships WHERE ends_at IS NULL
    UNION SELECT team_id,account_id FROM manager_assignments WHERE ends_at IS NULL
  `,
    )
    .toArray();
  const rankings = (group: "employee" | "team") => {
    const employee = group === "employee";
    const standings = store.storage.sql
      .exec<{
        id: string;
        name: string;
        amountPaise: number;
        salesCount: number;
        rank: number;
      }>(
        `
      SELECT id, name, amountPaise, salesCount,
        RANK() OVER (ORDER BY salesCount DESC) AS rank
      FROM (
        SELECT ${employee ? "a.id, a.display_name" : "t.id, t.name"} AS name,
          SUM(s.amount_paise) AS amountPaise, COUNT(*) AS salesCount
        FROM sales s JOIN ${employee ? "accounts a ON a.id=s.employee_id" : "teams t ON t.id=s.team_id"}
        WHERE s.status='approved' AND s.created_at>=? AND s.created_at<?
        GROUP BY ${employee ? "a.id" : "t.id"}
      ) ORDER BY salesCount DESC, name COLLATE NOCASE, id
    `,
        range.start,
        range.end,
      )
      .toArray();
    return standings.map((row) => {
      const members = teamPeople.filter((person) => person.teamId === row.id);
      const targetCount = employee
        ? (countTargets.get(row.id) ?? null)
        : members.length &&
            members.every((person) => countTargets.has(person.accountId))
          ? members.reduce(
              (sum, person) => sum + countTargets.get(person.accountId)!,
              0,
            )
          : null;
      return {
        ...row,
        targetCount,
        achievement: targetCount ? (row.salesCount / targetCount) * 100 : null,
      };
    });
  };
  const totals = store.storage.sql
    .exec(
      `SELECT
    COALESCE(SUM(CASE WHEN status='approved' THEN amount_paise ELSE 0 END),0) AS amountPaise,
    COUNT(CASE WHEN status='approved' THEN 1 END) AS approved,
    COUNT(CASE WHEN status='pending' THEN 1 END) AS pending
    FROM sales WHERE created_at>=? AND created_at<?`,
      range.start,
      range.end,
    )
    .one();
  // TV activity deliberately contains no student names, phones, notes or emails.
  const activity = store.storage.sql
    .exec(
      `SELECT s.id, a.display_name AS employeeName,
    t.name AS teamName, s.amount_paise AS amountPaise, s.status,
    COALESCE(s.reviewed_at,s.created_at) AS time
    FROM sales s JOIN accounts a ON a.id=s.employee_id JOIN teams t ON t.id=s.team_id
    WHERE s.created_at>=? AND s.created_at<?
    ORDER BY COALESCE(s.reviewed_at,s.created_at) DESC, s.id LIMIT 5`,
      range.start,
      range.end,
    )
    .toArray();
  return json({
    payments: recentPayments(store, env.CASHFREE_ENV, range.start, range.end),
    paymentEnvironment: env.CASHFREE_ENV ?? null,
    paymentsConfigured: Boolean(
      (env.CASHFREE_WEBHOOK_SECRET || env.CASHFREE_ALLOW_UNSIGNED === "true") &&
      env.CASHFREE_ENV,
    ),
    employees: rankings("employee"),
    teams: rankings("team"),
    totals,
    activity,
    period: { from: range.from, to: range.to },
    generatedAt: Date.now(),
  });
}
