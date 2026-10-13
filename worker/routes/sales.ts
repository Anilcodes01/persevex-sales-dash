import { SALES_DOMAINS } from "../../shared/domains";
import type { Account } from "../types";
import type { AuthStore } from "../storage/auth-store";
import {
  canReviewSales,
  saleTeams,
  saleReceipt,
  SALE_FIELDS,
  SALE_JOINS,
  advanceSalesVersion,
} from "../storage/sales-store";
import { rupeesToPaise } from "../security/money";
import { digest } from "../security/credentials";
import { HttpError, json } from "../http/helpers";

export function salesContext(actor: Account, store: AuthStore) {
  return json({
    teams: saleTeams(actor, store),
    canReview: canReviewSales(actor),
  });
}
export function listSales(
  actor: Account,
  store: AuthStore,
  url: URL,
  review = false,
) {
  if (review && !canReviewSales(actor))
    throw new HttpError(403, "Team Lead or administrator access required");
  const page = Number(url.searchParams.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
    throw new HttpError(400, "Invalid page");
  const filter = review
    ? `s.status = 'pending' AND (? = 'admin' OR s.team_id IN (SELECT team_id FROM manager_assignments WHERE account_id = ? AND ends_at IS NULL))`
    : `s.employee_id = ?`;
  const args = review ? [actor.role, actor.id] : [actor.id];
  const total = store.storage.sql
    .exec<{ total: number }>(
      `SELECT COUNT(*) AS total FROM sales s WHERE ${filter}`,
      ...args,
    )
    .one().total;
  const sales = store.storage.sql
    .exec(
      `SELECT ${SALE_FIELDS} ${SALE_JOINS} WHERE ${filter} ORDER BY s.created_at DESC, s.id LIMIT 25 OFFSET ?`,
      ...args,
      (page - 1) * 25,
    )
    .toArray();
  const totals = store.storage.sql
    .exec<{ approvedAmountPaise: number; approvedCount: number }>(
      `SELECT COALESCE(SUM(amount_paise),0) AS approvedAmountPaise, COUNT(*) AS approvedCount FROM sales WHERE employee_id = ? AND status = 'approved'`,
      actor.id,
    )
    .one();
  return json({ sales, total, page, pageSize: 25, totals });
}
export async function submitSale(
  body: Record<string, unknown>,
  actor: Account,
  store: AuthStore,
) {
  const studentName =
    typeof body.studentName === "string" ? body.studentName.trim() : "";
  const phone =
    typeof body.phone === "string" ? body.phone.replace(/[\s()-]/g, "") : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const amount = typeof body.amount === "string" ? body.amount.trim() : "";
  if (
    !studentName ||
    studentName.length > 100 ||
    !/^\+?\d{10,15}$/.test(phone) ||
    note.length > 500 ||
    !SALES_DOMAINS.some((d) => d === body.domain)
  )
    throw new HttpError(
      400,
      "Enter a student name, valid phone number, listed domain and a note up to 500 characters",
    );
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount))
    throw new HttpError(
      400,
      "Enter collected amount in INR with up to two decimal places",
    );
  const [whole, fraction = ""] = amount.split(".");
  const amountPaise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (amountPaise <= 0)
    throw new HttpError(400, "Collected amount must be greater than zero");
  if (
    typeof body.submissionId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(body.submissionId) ||
    typeof body.teamId !== "string"
  )
    throw new HttpError(400, "Submission ID and assigned team are required");
  const fingerprintValues = [
    studentName,
    phone,
    amountPaise,
    body.domain,
    note,
    body.teamId,
  ];
  const overallAmountPaise =
    body.overallAmount === undefined
      ? null
      : rupeesToPaise(body.overallAmount, "Overall amount");
  if (overallAmountPaise !== null && overallAmountPaise < amountPaise)
    throw new HttpError(
      400,
      "Overall amount cannot be less than registration amount",
    );
  if (overallAmountPaise !== null) fingerprintValues.push(overallAmountPaise);
  const fingerprint = await digest(JSON.stringify(fingerprintValues));
  // Resolve retries before rechecking membership: a transfer cannot lose an existing receipt.
  const previous = store.storage.sql
    .exec<{ id: string; fingerprint: string }>(
      "SELECT id, fingerprint FROM sales WHERE employee_id = ? AND submission_id = ?",
      actor.id,
      body.submissionId,
    )
    .toArray()[0];
  if (previous) {
    if (previous.fingerprint !== fingerprint)
      throw new HttpError(
        409,
        "This submission was already recorded with different details. Check your sales history.",
      );
    return json({ sale: saleReceipt(previous.id, store), replayed: true });
  }
  if (overallAmountPaise === null)
    throw new HttpError(400, "Overall amount (total sale value) is required");
  if (!saleTeams(actor, store).some((t) => t.id === body.teamId))
    throw new HttpError(
      403,
      "Select one of your assigned teams. Ask an administrator to assign a team first.",
    );
  const id = crypto.randomUUID(),
    now = Date.now();
  let version = 0;
  store.storage.transactionSync(() => {
    store.storage.sql.exec(
      `INSERT INTO sales (id, submission_id, employee_id, team_id, student_name, phone, domain, note, amount_paise, status, fingerprint, created_at, overall_amount_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      id,
      body.submissionId as string,
      actor.id,
      body.teamId as string,
      studentName,
      phone,
      body.domain as string,
      note,
      amountPaise,
      fingerprint,
      now,
      overallAmountPaise,
    );
    store.storage.sql.exec(
      "INSERT INTO collection_events VALUES (?, ?, ?, ?)",
      crypto.randomUUID(),
      id,
      amountPaise,
      now,
    );
    store.audit(actor.id, "sale_submitted", id);
    version = advanceSalesVersion(store);
  });
  store.onSalesChanged?.({
    employeeId: actor.id,
    teamId: body.teamId as string,
    version,
  });
  return json({ sale: saleReceipt(id, store), replayed: false }, 201);
}
export function reviewSale(
  body: Record<string, unknown>,
  actor: Account,
  store: AuthStore,
) {
  if (!canReviewSales(actor))
    throw new HttpError(403, "Team Lead or administrator access required");
  if (
    typeof body.saleId !== "string" ||
    !["approved", "rejected"].includes(body.status as string)
  )
    throw new HttpError(400, "Select a sale and approval decision");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length > 500 || (body.status === "rejected" && !reason))
    throw new HttpError(
      400,
      "Provide a rejection reason (up to 500 characters)",
    );
  const sale = store.storage.sql
    .exec<{ team_id: string; employee_id: string; status: string }>(
      "SELECT team_id, employee_id, status FROM sales WHERE id = ?",
      body.saleId,
    )
    .toArray()[0];
  if (!sale) throw new HttpError(404, "Sale not found");
  if (
    actor.role !== "admin" &&
    !store.storage.sql
      .exec(
        "SELECT id FROM manager_assignments WHERE account_id = ? AND team_id = ? AND ends_at IS NULL",
        actor.id,
        sale.team_id,
      )
      .toArray().length
  )
    throw new HttpError(
      403,
      "You can only review sales in teams assigned to you",
    );
  if (sale.status !== "pending") {
    if (sale.status === body.status)
      return json({ sale: saleReceipt(body.saleId, store) });
    throw new HttpError(409, "This sale has already been reviewed");
  }
  let version = 0;
  store.storage.transactionSync(() => {
    store.storage.sql.exec(
      "UPDATE sales SET status = ?, reviewed_by = ?, reviewed_at = ?, review_reason = ? WHERE id = ? AND status = 'pending'",
      body.status as string,
      actor.id,
      Date.now(),
      reason,
      body.saleId as string,
    );
    store.audit(actor.id, `sale_${body.status}`, body.saleId as string);
    version = advanceSalesVersion(store);
  });
  store.onSalesChanged?.({
    employeeId: sale.employee_id,
    teamId: sale.team_id,
    version,
  });
  return json({ sale: saleReceipt(body.saleId, store) });
}
