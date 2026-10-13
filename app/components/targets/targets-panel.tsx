"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "../forms/date-picker";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  monthDates,
  TARGET_BASES,
  type TargetBasis,
} from "../../../shared/targets";
import { jobRoleLabel } from "../../../shared/roles";
import { api, ApiError, type Account } from "../../lib/api";
import { useSalesLive } from "../../hooks/use-sales-live";
import { FormSelect, SelectOption } from "../forms/form-select";
import { WorkspaceDialog } from "../layout/workspace-dialog";
import { PageHeading } from "../layout/page-heading";
import { money } from "../sales/types";
import type { Performance, TargetsPage } from "./types";
export function TargetsPanel({
  account,
  onSessionExpired,
}: {
  account: Account;
  onSessionExpired: () => void;
}) {
  const [range, setRange] = useState(() => monthDates());
  const [data, setData] = useState<TargetsPage | null>(null);
  const [selection, setSelection] = useState<{
    person: Performance;
    editing: boolean;
  } | null>(null);
  const [dates, setDates] = useState(() => monthDates());
  const [basis, setBasis] = useState<TargetBasis>("registration");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const serial = useRef(0);
  const load = useCallback(() => {
    const request = ++serial.current;
    return api<TargetsPage>(
      `/api/manager/targets?from=${range.from}&to=${range.to}`,
    )
      .then((result) => {
        if (request === serial.current) setData(result);
        return true;
      })
      .catch((error) => {
        if (request !== serial.current) return false;
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          setData(null);
          setSelection(null);
        }
        if (error instanceof ApiError && error.status === 401)
          onSessionExpired();
        toast.error(
          error instanceof Error ? error.message : "Could not load targets",
        );
        return false;
      });
  }, [range.from, range.to, onSessionExpired]);
  useEffect(() => {
    void load();
  }, [load]);
  const accessChanged = useCallback(() => {
    setData(null);
    setSelection(null);
    void load();
  }, [load]);
  const connected = useCallback(() => {}, []);
  const live = useSalesLive({
    accountId: account.id,
    refresh: load,
    onAccessChanged: accessChanged,
    onConnected: connected,
    onSessionExpired,
  });
  function open(person: Performance, editing: boolean) {
    setSelection({ person, editing });
    setBasis(editing ? (person.basis ?? "registration") : "registration");
    setAmount(
      editing && person.targetPaise ? String(person.targetPaise / 100) : "",
    );
    setDates(
      editing && person.fromDate && person.toDate
        ? { from: person.fromDate, to: person.toDate }
        : range,
    );
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection) return;
    setBusy(true);
    try {
      await api<{ targetId: string }>("/api/manager/targets", {
        accountId: selection.person.id,
        from: dates.from,
        to: dates.to,
        basis,
        amount,
        ...(selection.editing
          ? {
              targetId: selection.person.targetId,
              expectedRevision: selection.person.revision ?? 0,
            }
          : { expectedRevision: 0 }),
      });
      toast.success(selection.editing ? "Target updated." : "Target created.");
      setSelection(null);
      if (dates.from !== range.from || dates.to !== range.to) setRange(dates);
      else await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save target",
      );
    } finally {
      setBusy(false);
    }
  }
  const shown = data?.from === range.from && data.to === range.to ? data : null;
  return (
    <>
      <PageHeading
        title="Targets"
        description={
          account.role === "admin"
            ? "Set and edit targets for employees and Team Leads."
            : "Set and edit targets for your assigned employees. Your own target is managed by an administrator."
        }
      />
      <div className="targets-toolbar">
        <Label>
          View from (IST)
          <DatePicker
            aria-label="View from date"
            min="2000-01-01"
            max="2099-12-31"
            value={range.from}
            onChange={(e) => {
              if (e.target.value)
                setRange((r) => ({
                  from: e.target.value,
                  to: e.target.value > r.to ? e.target.value : r.to,
                }));
            }}
          />
        </Label>
        <Label>
          View to (inclusive)
          <DatePicker
            aria-label="View to date"
            min={range.from}
            max="2099-12-31"
            value={range.to}
            onChange={(e) => {
              if (e.target.value)
                setRange((r) => ({ ...r, to: e.target.value }));
            }}
          />
        </Label>
        <Button variant="outline" onClick={() => setRange(monthDates())}>
          Current month
        </Button>
        <Button variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
        <span role="status">{live.state}</span>
      </div>
      <section className="roster-panel">
        <div className="panel-title">
          <div>
            <h2>People</h2>
            <p>
              Create a target for the selected dates. Existing targets appear
              below.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Approved registration</TableHead>
                <TableHead>Approved overall value</TableHead>
                <TableHead>Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown?.people.map((person) => (
                <TableRow key={person.id}>
                  <TableCell>
                    <strong>{person.displayName}</strong>
                    <p>{jobRoleLabel(person.jobRole)}</p>
                  </TableCell>
                  <TableCell>{money(person.registrationPaise)}</TableCell>
                  <TableCell>{money(person.overallPaise)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      onClick={() => open(person, false)}
                    >
                      Set target
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {shown && !shown.people.length && (
          <p className="sales-panel">No eligible employees assigned.</p>
        )}
      </section>
      <section className="roster-panel targets-assigned">
        <div className="panel-title">
          <div>
            <h2>Assigned targets</h2>
            <p>
              Targets overlapping the view dates. Achievement uses each target’s
              full date range.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person / period</TableHead>
                <TableHead>Basis</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Achieved</TableHead>
                <TableHead>Achievement</TableHead>
                <TableHead>Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown?.targets.map((target) => (
                <TableRow key={target.targetId}>
                  <TableCell>
                    <strong>{target.displayName}</strong>
                    <p>
                      {target.fromDate} → {target.toDate}
                    </p>
                  </TableCell>
                  <TableCell>
                    {TARGET_BASES.find((b) => b.value === target.basis)?.label}
                  </TableCell>
                  <TableCell>{money(target.targetPaise ?? 0)}</TableCell>
                  <TableCell>
                    {money(target.achievedPaise)}
                    {target.basis === "overall" &&
                      target.missingOverallCount > 0 && (
                        <p>
                          {target.missingOverallCount} historical overall values
                          not recorded.
                        </p>
                      )}
                  </TableCell>
                  <TableCell>{target.achievement?.toFixed(1)}%</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      onClick={() => open(target, true)}
                    >
                      Edit target
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {shown && !shown.targets.length && (
          <p className="sales-panel">No targets in this date range.</p>
        )}
      </section>
      {selection && (
        <WorkspaceDialog
          title={`${selection.editing ? "Edit" : "Set"} target for ${selection.person.displayName}`}
          description="Both dates are inclusive in Asia/Kolkata. Approved sales only; periods for the same person cannot overlap."
          locked={busy}
          onClose={() => setSelection(null)}
        >
          <form className="account-form" onSubmit={save}>
            <Label>
              From date
              <DatePicker
                aria-label="Target start date"
                required
                min="2000-01-01"
                max="2099-12-31"
                value={dates.from}
                onChange={(e) =>
                  setDates((d) => ({ ...d, from: e.target.value }))
                }
              />
            </Label>
            <Label>
              To date (inclusive)
              <DatePicker
                aria-label="Target end date"
                required
                min={dates.from || "2000-01-01"}
                max="2099-12-31"
                value={dates.to}
                onChange={(e) =>
                  setDates((d) => ({ ...d, to: e.target.value }))
                }
              />
            </Label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDates(monthDates())}
            >
              Use current calendar month
            </Button>
            <Label>
              Target basis
              <FormSelect
                value={basis}
                onChange={(e) => setBasis(e.target.value as TargetBasis)}
              >
                {TARGET_BASES.map((b) => (
                  <SelectOption key={b.value} value={b.value}>
                    {b.label}
                  </SelectOption>
                ))}
              </FormSelect>
            </Label>
            <p>
              {basis === "registration"
                ? "Initial registration amounts collected on approved sales."
                : "Total sale values including remaining amounts; this is not collected revenue."}
            </p>
            <Label>
              Target amount (₹)
              <Input
                type="number"
                inputMode="decimal"
                required
                min="0.01"
                max="99999999.99"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Label>
            <div className="dialog-footer">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setSelection(null)}
              >
                Cancel
              </Button>
              <Button className="button primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : selection.editing
                    ? "Save changes"
                    : "Create target"}
              </Button>
            </div>
          </form>
        </WorkspaceDialog>
      )}
    </>
  );
}
