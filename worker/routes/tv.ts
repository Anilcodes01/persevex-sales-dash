import type { AuthStore } from "../storage/auth-store";
import { requestedRange } from "../storage/target-periods";
import { json } from "../http/helpers";

export function tvLeaderboard(store: AuthStore) {
  const range = requestedRange({});
  const rankings = (group: "employee" | "team") => {
    const employee = group === "employee";
    return store.storage.sql
      .exec(
        `
      SELECT id, name, amountPaise, salesCount,
        RANK() OVER (ORDER BY amountPaise DESC) AS rank
      FROM (
        SELECT ${employee ? "a.id, a.display_name" : "t.id, t.name"} AS name,
          SUM(s.amount_paise) AS amountPaise, COUNT(*) AS salesCount
        FROM sales s JOIN ${employee ? "accounts a ON a.id=s.employee_id" : "teams t ON t.id=s.team_id"}
        WHERE s.status='approved' AND s.created_at>=? AND s.created_at<?
        GROUP BY ${employee ? "a.id" : "t.id"}
      ) ORDER BY amountPaise DESC, name COLLATE NOCASE, id
    `,
        range.start,
        range.end,
      )
      .toArray();
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
    employees: rankings("employee"),
    teams: rankings("team"),
    totals,
    activity,
    period: { from: range.from, to: range.to },
    generatedAt: Date.now(),
  });
}
