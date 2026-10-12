"use client";
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
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const requestSerial = useRef(0);
  const filterKey = JSON.stringify([search, role, jobRole, status, page]);
  const loading = refreshing || loadedKey !== filterKey;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(() => {
    const serial = ++requestSerial.current;
    const params = new URLSearchParams({
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
  }, [search, role, jobRole, status, page, filterKey, onSessionExpired]);
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
        create:
          "Account created. Share the temporary password privately; the employee will choose their own at first sign-in.",
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
