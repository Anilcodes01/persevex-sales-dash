"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SALES_DOMAINS } from "../../../shared/domains";
import { api } from "../../lib/api";
import { FormSelect, SelectOption } from "../forms/form-select";
import { DomainSelect } from "../forms/domain-select";
import { money, type Sale, type SalesContext } from "./types";
const empty = {
  studentName: "",
  phone: "",
  amount: "",
  overallAmount: "",
  domain: "",
  note: "",
  teamId: "",
  submissionId: "",
};
type Draft = typeof empty;
export function SaleForm({
  accountId,
  context,
  onSaved,
  onBusyChange,
  inDialog = false,
}: {
  accountId: string;
  context: SalesContext;
  onSaved: () => void;
  onBusyChange?: (busy: boolean) => void;
  inDialog?: boolean;
}) {
  const key = `persevex-sale-draft:${accountId}`;
  const [draft, setDraft] = useState<Draft>(() => {
    let next = { ...empty, submissionId: crypto.randomUUID() };
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = { ...empty, ...JSON.parse(saved) };
        if (Object.keys(empty).every((k) => typeof parsed[k] === "string"))
          next = parsed;
      }
    } catch {
      /* Storage may be disabled. */
    }
    if (!next.teamId && context.teams.length === 1)
      next.teamId = context.teams[0].id;
    return next;
  });
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      /* Keep in-memory form usable. */
    }
  }, [key, draft]);
  function change(field: keyof Draft, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!SALES_DOMAINS.some((domain) => domain === draft.domain)) {
      toast.error("Select a student domain.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    onBusyChange?.(true);
    try {
      const result = await api<{ sale: Sale }>("/api/employee/sales", draft);
      setReceipt(result.sale);
      setUncertain(false);
      toast.success(
        `Sale recorded: ${money(result.sale.amountPaise)}. ${result.sale.status === "pending" ? "Pending approval" : result.sale.status}.`,
      );
      setDraft({
        ...empty,
        submissionId: crypto.randomUUID(),
        teamId: context.teams.length === 1 ? context.teams[0].id : "",
      });
      // The modal closes immediately; don't rely on a later effect to clear the
      // accepted draft, or reopening could reuse an already recorded submission.
      try {
        localStorage.removeItem(key);
      } catch {
        /* Storage may be disabled. */
      }
      onSaved();
    } catch (error) {
      // Keep the exact payload/key for safe retries when acceptance is unknown.
      setUncertain(true);
      toast.error(
        error instanceof Error ? error.message : "Could not record sale",
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
      submitting.current = false;
    }
  }
  if (!context.teams.length)
    return (
      <section
        className={inDialog ? "sale-dialog-form" : "roster-panel sales-panel"}
      >
        {!inDialog && <h2>Post sale</h2>}
        <p>Ask an administrator to assign your team before booking a sale.</p>
      </section>
    );
  return (
    <section
      className={inDialog ? "sale-dialog-form" : "roster-panel sales-panel"}
    >
      {!inDialog && <h2>Post sale</h2>}
      {!inDialog && <p>Registration amount is the initial collection; overall amount is the total sale value. Every sale requires approval.</p>}
      {receipt && (
        <div className="sale-receipt">
          <strong>Sale recorded · {receipt.status}</strong>
          <p>
            {receipt.studentName} · {money(receipt.amountPaise)} ·{" "}
            {receipt.teamName}
          </p>
          <p>Receipt: {receipt.id}</p>
          <p>
            {new Date(receipt.createdAt).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST
          </p>
        </div>
      )}
      <form className="account-form sales-form" onSubmit={submit}>
        <fieldset disabled={busy || uncertain}>
          <Label>
            Student name
            <Input
              autoComplete="off"
              value={draft.studentName}
              onChange={(e) => change("studentName", e.target.value)}
              maxLength={100}
              required
            />
          </Label>
          <Label>
            Phone number
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={draft.phone}
              onChange={(e) => change("phone", e.target.value)}
              maxLength={24}
              placeholder="e.g. 9876543210"
              required
            />
          </Label>
          <Label>
            Registration amount (₹)
            <Input
              type="number"
              inputMode="decimal"
              min="0.01"
              max="99999999.99"
              step="0.01"
              value={draft.amount}
              onChange={(e) => change("amount", e.target.value)}
              required
            />
            <span className="field-help">Initial money collected</span>
          </Label>
          <Label>
            Overall amount (₹)
            <Input
              type="number"
              inputMode="decimal"
              min={draft.amount || "0.01"}
              max="99999999.99"
              step="0.01"
              value={draft.overallAmount}
              onChange={(e) => change("overallAmount", e.target.value)}
              required
            />
            <span className="field-help">
              Total sale value · Remaining:{" "}
              {draft.overallAmount &&
              draft.amount &&
              Number(draft.overallAmount) >= Number(draft.amount)
                ? money(
                    Math.round(
                      (Number(draft.overallAmount) - Number(draft.amount)) *
                        100,
                    ),
                  )
                : "—"}
            </span>
          </Label>
          <Label>
            Student domain
            <DomainSelect
              value={draft.domain}
              onChange={(value) => change("domain", value)}
              disabled={busy || uncertain}
            />
          </Label>
          <Label>
            Assigned team
            <FormSelect
              value={draft.teamId}
              onChange={(e) => change("teamId", e.target.value)}
              required
            >
              <SelectOption value="" disabled>
                Select your team
              </SelectOption>
              {context.teams.map((team) => (
                <SelectOption value={team.id} key={team.id}>
                  {team.name}
                </SelectOption>
              ))}
            </FormSelect>
          </Label>
          <Label className="sale-note-field">
            Note (optional)
            <Input
              value={draft.note}
              onChange={(e) => change("note", e.target.value)}
              maxLength={500}
            />
          </Label>
        </fieldset>
        {uncertain && (
          <p>
            Your draft is preserved. Retry the same details to recover the
            receipt safely. Check history before starting a different sale.
          </p>
        )}
        <div className="sale-submit-footer">
        <p className="field-help">Draft saved on this device. Only approved sales count.</p>
        <div className="sales-buttons">
          <Button className="button primary" disabled={busy}>
            {busy
              ? "Recording…"
              : uncertain
                ? "Retry submission"
                : "Submit for approval"}
          </Button>
          {uncertain && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setUncertain(false);
                toast.info(
                  "Check your sales history before changing a submission that may already be recorded.",
                );
              }}
            >
              Edit draft
            </Button>
          )}
        </div>
        </div>
      </form>
    </section>
  );
}
