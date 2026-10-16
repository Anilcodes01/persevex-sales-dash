import type { Account, Env } from "../types";
import type { AuthStore } from "../storage/auth-store";
import { HttpError, json } from "../http/helpers";
import { advanceSalesVersion } from "../storage/sales-store";

export async function clearDevelopmentData(body: Record<string, unknown>, actor: Account, tokenHash: string, store: AuthStore, env: Env) {
  if(actor.role!=="admin") throw new HttpError(403,"Administrator access required");
  if(body.confirm!=="CLEAR DEVELOPMENT DATA") throw new HttpError(400,"Confirm the data reset");
  const tables=["collection_events","sales","period_target_revisions","period_targets","target_revisions","performance_targets","team_memberships","manager_assignments","deleted_teams","account_avatars","teams","auth_audit","auth_rate_limits"];
  const existing=new Set(store.storage.sql.exec<{name:string}>("SELECT name FROM sqlite_master WHERE type='table'").toArray().map(row=>row.name));
  const resetAt=Date.now();
  let preservedPayments=0;
  store.storage.transactionSync(() => {
    preservedPayments=store.storage.sql.exec<{count:number}>("SELECT COUNT(*) AS count FROM cashfree_payments").one().count;
    for(const table of tables) if(existing.has(table)) store.storage.sql.exec(`DELETE FROM ${table}`);
    store.storage.sql.exec("DELETE FROM sessions WHERE token_hash != ?",tokenHash);
    store.storage.sql.exec("DELETE FROM accounts WHERE id != ?",actor.id);
    advanceSalesVersion(store);
  });
  let avatarCleanupPending=false;
  if(env.AVATARS) {
    try {
      let cursor: string | undefined;
      do {
        const result=await env.AVATARS.list({prefix:"avatars/",cursor,limit:500});
        const keys=result.objects.filter(object=>object.uploaded.getTime()<=resetAt).map(object=>object.key);
        if(keys.length) await env.AVATARS.delete(keys);
        cursor=result.truncated ? result.cursor : undefined;
      } while(cursor);
    } catch { avatarCleanupPending=true; }
  }
  return json({ok:true,preservedPayments,avatarCleanupPending});
}
