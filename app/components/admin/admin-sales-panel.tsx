"use client";
import { useCallback, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Account } from "../../lib/api";
import { monthDates } from "../../../shared/targets";
import { DatePicker } from "../forms/date-picker";
import { SearchableSelect } from "../forms/searchable-select";
import { SalesPanel } from "../sales/sales-panel";
import type { SalesPage } from "../sales/types";

export function AdminSalesPanel({
  account,
  title = "Sales",
  showHeading = true,
  onSessionExpired,
}: {
  account: Account;
  title?: string;
  showHeading?: boolean;
  onSessionExpired: () => void;
}) {
  const [filters, setFilters] = useState(() => ({
    ...monthDates(),
    teamId: "",
    employeeId: "",
  }));
  const [options, setOptions] = useState<
    Pick<SalesPage, "teams" | "employees">
  >({});
  const receive = useCallback(
    (data: SalesPage) =>
      setOptions({ teams: data.teams, employees: data.employees }),
    [],
  );
  const query = new URLSearchParams(filters).toString();
  function change(field: keyof typeof filters, value: string) {
    setFilters((previous) => ({ ...previous, [field]: value }));
  }
  return (
    <div className="sales-workspace">
      {showHeading && <div className="panel-title">
        <div>
          <h1>{title}</h1>
          <p>
            Sales from everyone, including Team Leads. Dates follow India
            Standard Time.
          </p>
        </div>
      </div>}
      <section
        className="roster-panel admin-sales-filters"
        aria-label="Sales filters"
      >
        <Label>
          Team
          <SearchableSelect
            label="Teams"
            allLabel="All teams"
            value={filters.teamId}
            onChange={(value) => change("teamId", value)}
            options={(options.teams ?? []).map((team) => ({
              value: team.id,
              label: team.name,
            }))}
          />
        </Label>
        <Label>
          Employee
          <SearchableSelect
            label="Employees"
            allLabel="All employees"
            value={filters.employeeId}
            onChange={(value) => change("employeeId", value)}
            options={(options.employees ?? []).map((employee) => ({
              value: employee.id,
              label: `${employee.name} · ${employee.email}`,
            }))}
          />
        </Label>
        <Label>
          From
          <DatePicker
            value={filters.from}
            max={filters.to}
            aria-label="Sales from date"
            onChange={(e) => change("from", e.target.value)}
          />
        </Label>
        <Label>
          To
          <DatePicker
            value={filters.to}
            min={filters.from}
            aria-label="Sales to date"
            onChange={(e) => change("to", e.target.value)}
          />
        </Label>
        <Button
          variant="outline"
          onClick={() =>
            setFilters({ ...monthDates(), teamId: "", employeeId: "" })
          }
        >
          Current month
        </Button>
      </section>
      <SalesPanel
        key={query}
        account={account}
        adminQuery={query}
        onData={receive}
        onSessionExpired={onSessionExpired}
      />
    </div>
  );
}
