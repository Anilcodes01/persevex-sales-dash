"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { SearchableSelect } from "../forms/searchable-select";
import { WorkspaceDialog } from "../layout/workspace-dialog";
import { PageHeading } from "../layout/page-heading";
import { money } from "../sales/types";
import { formatTarget } from "./format-target";
import type { Performance, TargetsPage } from "./types";
export function TargetsPanel({
  account,
  onSessionExpired,
}: {
  account: Account;
  onSessionExpired: () => void;
}) {
  const [tableView, setTableView] = useState<"people" | "assigned">("people");
  const [range, setRange] = useState(() => monthDates());
  const [teamId, setTeamId] = useState("");
  const [data, setData] = useState<TargetsPage | null>(null);
  const [selection, setSelection] = useState<{
    person: Performance;
    editing: boolean;
  } | null>(null);
  const [dates, setDates] = useState(() => monthDates());
  const [basis, setBasis] = useState<TargetBasis>("sales_count");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const serial = useRef(0);
  const load = useCallback(() => {
    const request = ++serial.current;
    return api<TargetsPage>(
      `/api/manager/targets?${new URLSearchParams({ from: range.from, to: range.to, teamId })}`,
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
  }, [range.from, range.to, teamId, onSessionExpired]);
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
    if (!editing) {
      const existing = data?.targets.filter(target => target.id === person.id) ?? [];
      const match = existing.find(target => target.fromDate === range.from && target.toDate === range.to)
        ?? (existing.length === 1 ? existing[0] : undefined);
      if (match) { person = match; editing = true; }
      else if (existing.length > 1) {
        setTableView("assigned");
        toast.info("Choose the assigned target you want to edit.");
        return;
      }
    }
    setSelection({ person, editing });
    setBasis(editing ? (person.basis ?? "sales_count") : "sales_count");
    setAmount(
      editing
        ? person.basis === "sales_count"
          ? String(person.targetCount ?? "")
          : person.targetPaise
            ? String(person.targetPaise / 100)
            : ""
        : "",
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
        ...(basis === "sales_count" ? { count: amount } : { amount }),
        ...(selection.editing
          ? {
              targetId: selection.person.targetId,
              expectedRevision: selection.person.revision ?? 0,
            }
          : { expectedRevision: 0 }),
      });
      toast.success(selection.editing ? "Target updated." : "Target created.");
      setSelection(null);
      setTableView("assigned");
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
  const shown =
    data?.from === range.from && data.to === range.to && data.teamId === teamId
      ? data
      : null;
  const assignments = new Map<string, Performance[]>();
  for (const target of shown?.targets ?? [])
    assignments.set(target.id, [...(assignments.get(target.id) ?? []), target]);
  const assignedPeople =
    shown?.people.filter((person) => assignments.has(person.id)).length ?? 0;
  const unassignedPeople = (shown?.people.length ?? 0) - assignedPeople;
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
        {account.role === "admin" && (
          <Label className="targets-team-filter">
            Team
            <SearchableSelect
              value={teamId}
              label="Teams"
              allLabel="All teams"
              options={(data?.teams ?? []).map((team) => ({
                value: team.id,
                label: team.name,
              }))}
              onChange={(value) => {
                setTeamId(value);
                setSelection(null);
              }}
            />
          </Label>
        )}
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
      <section className="roster-panel" aria-label="Target management">
        <div className="panel-title">
          <div>
            <h2>{tableView === "people" ? "People" : "Assigned targets"}</h2>
            <p>
              {tableView === "people"
                ? "Choose a person to set a target for the selected dates."
                : "Targets overlapping the view dates. Achievement uses each target’s full date range."}
            </p>
          </div>
          <div
            className="targets-view-switch"
            role="group"
            aria-label="Target table view"
          >
            <Button
              variant={tableView === "people" ? "default" : "outline"}
              aria-pressed={tableView === "people"}
              onClick={() => setTableView("people")}
            >
              People {shown ? `(${shown.people.length})` : ""}
            </Button>
            <Button
              variant={tableView === "assigned" ? "default" : "outline"}
              aria-pressed={tableView === "assigned"}
              onClick={() => setTableView("assigned")}
            >
              Assigned targets {shown ? `(${shown.targets.length})` : ""}
            </Button>
          </div>
        </div>
        {tableView === "people" ? (
          <>
            <div className="target-assignment-summary" role="status">
              <Badge variant="outline">
                Assigned: {shown ? assignedPeople : "—"}
              </Badge>
              <Badge variant="outline">
                Not assigned: {shown ? unassignedPeople : "—"}
              </Badge>
              <span>People with targets overlapping the selected dates</span>
            </div>
            <div className="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Target status</TableHead>
                    <TableHead>Approved sales</TableHead>
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
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            assignments.has(person.id)
                              ? "target-is-assigned"
                              : "target-is-unassigned"
                          }
                        >
                          {assignments.has(person.id)
                            ? `Assigned · ${assignments
                                .get(person.id)!
                                .map((target) => {
                                  const value = formatTarget(
                                    target.targetValue,
                                    target.basis,
                                  );
                                  const label =
                                    target.basis === "sales_count"
                                      ? value
                                      : `${value} (${TARGET_BASES.find((b) => b.value === target.basis)?.label})`;
                                  return assignments.get(person.id)!.length > 1
                                    ? `${label} [${target.fromDate} → ${target.toDate}]`
                                    : label;
                                })
                                .join("; ")}`
                            : "Not assigned"}
                        </Badge>
                      </TableCell>
                      <TableCell>{person.approvedCount}</TableCell>
                      <TableCell>{money(person.registrationPaise)}</TableCell>
                      <TableCell>{money(person.overallPaise)}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          onClick={() => open(person, false)}
                        >
                          {person.targetId ? "Edit target" : "Set / edit target"}
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
          </>
        ) : (
          <>
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
                        {
                          TARGET_BASES.find((b) => b.value === target.basis)
                            ?.label
                        }
                      </TableCell>
                      <TableCell>
                        {formatTarget(target.targetValue, target.basis)}
                      </TableCell>
                      <TableCell>
                        {formatTarget(target.achievedValue, target.basis)}
                        {target.basis === "overall" &&
                          target.missingOverallCount > 0 && (
                            <p>
                              {target.missingOverallCount} historical overall
                              values not recorded.
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
          </>
        )}
      </section>
      {selection && (
        <WorkspaceDialog
          title={`${selection.editing ? "Edit" : "Set"} target for ${selection.person.displayName}`}
          description="Set a goal and period. Only approved sales count toward achievement."
          className="target-editor-dialog"
          locked={busy}
          onClose={() => setSelection(null)}
        >
          <form className="account-form target-editor-form" onSubmit={save}>
            <div className="target-date-fields">
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
            </div>
            <div className="target-period-help">
            <p>Inclusive dates · IST. Target periods cannot overlap.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDates(monthDates())}
            >
              Current month
            </Button>
            </div>
            <Label>
              Target basis
              <FormSelect
                value={basis}
                onChange={(e) => {
                  setBasis(e.target.value as TargetBasis);
                  setAmount("");
                }}
              >
                {TARGET_BASES.map((b) => (
                  <SelectOption key={b.value} value={b.value}>
                    {b.label}
                  </SelectOption>
                ))}
              </FormSelect>
            </Label>
            <p className="target-basis-help">
              {basis === "sales_count"
                ? "Each approved sale counts once within the selected dates. Pending and rejected sales do not count."
                : basis === "registration"
                  ? "Initial registration amounts collected on approved sales."
                  : "Total sale values including remaining amounts; this is not collected revenue."}
            </p>
            <Label>
              {basis === "sales_count"
                ? "Target number of sales"
                : "Target amount (₹)"}
              <Input
                type="number"
                inputMode={basis === "sales_count" ? "numeric" : "decimal"}
                required
                min={basis === "sales_count" ? "1" : "0.01"}
                max={basis === "sales_count" ? "9999999" : "99999999.99"}
                step={basis === "sales_count" ? "1" : "0.01"}
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
