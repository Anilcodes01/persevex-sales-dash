"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WorkspaceDialog } from "../layout/workspace-dialog";
import { AccountSettings } from "../employee/account-settings";
import { api, type Account } from "../../lib/api";

export function AdminProfile({account,onClose,onPassword}: {account:Account;onClose:()=>void;onPassword:()=>void}) {
  const [confirming,setConfirming]=useState(false);
  const [busy,setBusy]=useState(false);
  async function clear() {
    setBusy(true);
    try {
      const result=await api<{preservedPayments:number;avatarCleanupPending:boolean}>("/api/admin/clear-development-data",{confirm:"CLEAR DEVELOPMENT DATA"});
      window.dispatchEvent(new CustomEvent("avatar-updated",{detail:account.id}));
      if(result.avatarCleanupPending) toast.warning("Data cleared. Some R2 avatar files could not be removed; you can retry the reset.");
      else toast.success(`Data cleared. Your admin account and ${result.preservedPayments} Cashfree payments were kept.`);
      try { sessionStorage.setItem("development-reset-result", JSON.stringify(result)); } catch { /* Storage may be disabled. */ }
      window.location.reload();
    } catch(error) { toast.error(error instanceof Error ? error.message : "Could not clear data"); setBusy(false); }
  }
  return <WorkspaceDialog title="Admin profile" description="Manage your profile and development workspace." locked={busy} onClose={onClose} className="admin-profile-dialog">
    <AccountSettings account={account} />
    <div className="admin-profile-actions"><Button variant="outline" onClick={onPassword} disabled={busy}>Change password</Button></div>
    <section className="development-reset-panel">
      <h2>Clear development data</h2>
      <p>Removes all other accounts, teams, sales, targets and avatars. Keeps your current administrator account and all Cashfree payments.</p>
      {!confirming ? <Button variant="destructive" onClick={()=>setConfirming(true)}>Clear all development data</Button> : <>
        <p role="alert">This cannot be undone. Only your admin account will remain.</p>
        <div className="avatar-crop-actions"><Button variant="outline" disabled={busy} onClick={()=>setConfirming(false)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={()=>void clear()}>{busy ? "Clearing…" : "Yes, clear data"}</Button></div>
      </>}
    </section>
  </WorkspaceDialog>;
}
