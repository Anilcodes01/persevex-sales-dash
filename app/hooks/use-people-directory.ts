"use client";
import { useNotificationState } from "./use-notification-state";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Account, ApiError, RosterAccount, api } from "../lib/api";
import type { Roster, Action, Selection } from "../components/admin/types";
export function usePeopleDirectory({
  account,
  onSessionExpired,
  onAccountUpdated,
}: {
  account: Account;
  onSessionExpired: () => void;
  onAccountUpdated: () => void;
}) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [jobRole, setJobRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [teamId, setTeamId] = useState("");
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const requestSerial = useRef(0);
  const filterKey = JSON.stringify([search, role, jobRole, status, teamId, page]);
  const loading = refreshing || loadedKey !== filterKey;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useNotificationState();
  const [dialogError, setDialogError] = useNotificationState();
  const [notice, setNotice] = useNotificationState("success");
  const load = useCallback(() => {
    const serial = ++requestSerial.current;
    const params = new URLSearchParams({
      teamId,
      q: search,
      role,
      jobRole,
      status,
      page: String(page),
    });
    return api<Roster>(`/api/admin/accounts?${params}`)
      .then((result) => {
        if (serial !== requestSerial.current) return;
        setError("");
        setRoster(result);
      })
      .catch((err) => {
        if (serial !== requestSerial.current) return;
        if (err instanceof ApiError && err.status === 401) onSessionExpired();
        setError(
          err instanceof Error ? err.message : "Could not load accounts",
        );
      })
      .finally(() => {
        if (serial === requestSerial.current) {
          setLoadedKey(filterKey);
          setRefreshing(false);
        }
      });
  }, [
    search,
    role,
    jobRole,
    status,
    page,
    teamId,
    filterKey,
    onSessionExpired,
    setError,
  ]);
  useEffect(() => {
    void load();
  }, [load]);
  function refresh() {
    setRefreshing(true);
    void load();
  }
  function open(action: Action, person?: RosterAccount) {
    setSelection({ action, account: person });
    setDialogError("");
  }
  async function mutate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setDialogError("");
    setNotice("");
    try {
      const paths: Record<Action, string> = {
        resetSales: "/api/admin/accounts/reset-sales",
        create: "/api/admin/accounts",
        edit: "/api/admin/accounts/update",
        reset: "/api/admin/accounts/reset-password",
        disable: "/api/admin/accounts/disable",
        enable: "/api/admin/accounts/enable",
      };
      await api(paths[selection.action], {
        ...values,
        accountId: selection.account?.id,
      });
      const messages: Record<Action, string> = {
        resetSales: "Sales reset for the selected dates. Records are retained in history.",
        create:
          "Account created. Share the sign-in credentials privately; they can sign in directly to their dashboard.",
        edit: "Account details updated.",
        reset: "Temporary password saved. Existing sessions have been revoked.",
        disable: "Account disabled. Access has been revoked.",
        enable: "Account reactivated.",
      };
      setNotice(messages[selection.action]);
      form.reset();
      setSelection(null);
      if (selection.account?.id === account.id) {
        if (selection.action === "reset") {
          onSessionExpired();
          return;
        }
        onAccountUpdated();
      }
      setRefreshing(true);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onSessionExpired();
      setDialogError(
        err instanceof Error ? err.message : "Could not save account",
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    roster,
    teamId,
    setTeamId,
    query,
    setQuery,
    search,
    role,
    setRole,
    jobRole,
    setJobRole,
    status,
    setStatus,
    page,
    setPage,
    setSearch,
    loading,
    selection,
    setSelection,
    busy,
    error,
    dialogError,
    notice,
    refresh,
    open,
    mutate,
  };
}
export type PeopleDirectory = ReturnType<typeof usePeopleDirectory>;
