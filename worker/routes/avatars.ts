import type { Account, Env } from "../types";
import type { AuthStore } from "../storage/auth-store";
import { HttpError, json } from "../http/helpers";
import { MAX_AVATAR_BYTES, validateAvatar } from "../avatars/validate";

export async function avatarRequest(request: Request, actor: Account, store: AuthStore, env: Env) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId") || actor.id;
  if (request.method === "POST" && accountId !== actor.id && actor.role !== "admin")
    throw new HttpError(403, "You can only change your own avatar");
  if (!store.storage.sql.exec("SELECT id FROM accounts WHERE id=?",accountId).toArray().length)
    throw new HttpError(404,"Account not found");
  if (!env.AVATARS) throw new HttpError(503,"Avatar storage is not configured");
  const current = () => store.storage.sql.exec<{ object_key: string }>("SELECT object_key FROM account_avatars WHERE account_id=?",accountId).toArray()[0]?.object_key;
  if (request.method === "GET") {
    const key=current();
    if (!key) return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});
    const object=await env.AVATARS.get(key);
    if (!object) throw new HttpError(404,"Avatar not found");
    const headers={"Content-Type":"image/png","Cache-Control":"private, no-cache","ETag":object.httpEtag,"X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'"};
    if (request.headers.get("If-None-Match") === object.httpEtag) return new Response(null,{status:304,headers});
    return new Response(object.body,{headers});
  }
  store.limit(`avatar:${actor.id}`,20);
  if (url.searchParams.get("remove") === "true") {
    const key=current();
    store.storage.transactionSync(() => {
      store.storage.sql.exec("DELETE FROM account_avatars WHERE account_id=?",accountId);
      store.audit(actor.id,"avatar_removed",accountId);
    });
    if (key) await env.AVATARS.delete(key).catch(() => {});
    return json({ok:true});
  }
  if (request.headers.get("Content-Type") !== "image/png") throw new HttpError(415,"PNG required");
  const reader=request.body?.getReader();
  if (!reader) throw new HttpError(400,"Image required");
  const chunks: Uint8Array[]=[]; let size=0;
  for (;;) { const {done,value}=await reader.read(); if (done) break; size+=value.length;
    if(size>MAX_AVATAR_BYTES) { await reader.cancel(); throw new HttpError(413,"Avatar must be under 256 KB"); } chunks.push(value); }
  const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  await validateAvatar(bytes);
  const key=`avatars/${accountId}/${crypto.randomUUID()}.png`;
  await env.AVATARS.put(key,bytes,{httpMetadata:{contentType:"image/png"}});
  const old=current();
  try {
    store.storage.transactionSync(() => {
      store.storage.sql.exec("INSERT INTO account_avatars VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET object_key=excluded.object_key",accountId,key);
      store.audit(actor.id,"avatar_updated",accountId);
    });
  } catch (error) { await env.AVATARS.delete(key).catch(() => {}); throw error; }
  if(old) await env.AVATARS.delete(old).catch(() => {});
  return json({ok:true});
}
