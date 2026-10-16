import type { Env } from "../types";
import { HttpError, json } from "../http/helpers";
import { rupeesToPaise } from "../security/money";

export type CashfreePayment = {
  environment: "sandbox" | "production";
  verified: boolean;
  paymentId: string;
  orderId: string;
  amountPaise: number;
  currency: "INR";
  paidAt: number;
  name: string;
  email: string;
  phone: string;
};
const encoder = new TextEncoder();
const MAX_BYTES = 65536;
async function rawBody(request: Request) {
  const declared = request.headers.get("Content-Length");
  if (declared && Number(declared) > MAX_BYTES)
    throw new HttpError(413, "Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body required");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "Request too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "Invalid payment payload");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false) {
  if ((value === undefined || value === null) && !required) return "";
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    (required && !value.trim())
  )
    throw new HttpError(400, "Invalid payment details");
  return value.trim();
}
export async function cashfreeWebhook(request: Request, env: Env) {
  try {
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    if (
      (!env.CASHFREE_WEBHOOK_SECRET &&
        env.CASHFREE_ALLOW_UNSIGNED !== "true") ||
      !["sandbox", "production"].includes(env.CASHFREE_ENV ?? "")
    )
      throw new HttpError(503, "Payment receiver not configured");
    if (
      request.headers
        .get("Content-Type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      throw new HttpError(415, "JSON required");
    const bytes = await rawBody(request);
    const verified = Boolean(env.CASHFREE_WEBHOOK_SECRET);
    if (verified) {
      const timestamp = request.headers.get("x-webhook-timestamp") ?? "";
      const signature = request.headers.get("x-webhook-signature") ?? "";
      if (
        !/^\d{13}$/.test(timestamp) ||
        !/^[A-Za-z0-9+/]{43}=$/.test(signature) ||
        Number(timestamp) > Date.now() + 300000
      )
        throw new HttpError(401, "Invalid webhook signature");
      const prefix = encoder.encode(timestamp);
      const signed = new Uint8Array(prefix.length + bytes.length);
      signed.set(prefix);
      signed.set(bytes, prefix.length);
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(env.CASHFREE_WEBHOOK_SECRET!),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)),
        signed,
      );
      if (!valid) throw new HttpError(401, "Invalid webhook signature");
    }
    // Verify bytes first: JSON reserialization changes decimals and signatures.
    // Old signed deliveries are accepted for Cashfree retries; the durable
    // payment ID prevents replay from inserting or notifying a second time.
    let body: Record<string, unknown>;
    try {
      body = object(
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
            bytes,
          ),
        ),
      );
    } catch {
      throw new HttpError(400, "Invalid JSON");
    }
    if (body.type !== "PAYMENT_SUCCESS_WEBHOOK")
      return json({ ok: true, ignored: true });
    const data = object(body.data),
      payment = object(data.payment),
      order = object(data.order);
    if (payment.payment_status !== "SUCCESS")
      throw new HttpError(400, "Invalid success event");
    if (payment.payment_currency !== "INR" || order.order_currency !== "INR")
      throw new HttpError(400, "Only INR payments are supported");
    const paymentId =
      typeof payment.cf_payment_id === "number" &&
      Number.isSafeInteger(payment.cf_payment_id)
        ? String(payment.cf_payment_id)
        : text(payment.cf_payment_id, 100, true);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(paymentId))
      throw new HttpError(400, "Invalid payment ID");
    const time = text(payment.payment_time, 64, true);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        time,
      )
    )
      throw new HttpError(400, "Payment time requires a timezone");
    const [year, month, day] = time.slice(0, 10).split("-").map(Number);
    if (
      new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !==
      time.slice(0, 10)
    )
      throw new HttpError(400, "Invalid payment date");
    const paidAt = Date.parse(time);
    if (
      !Number.isFinite(paidAt) ||
      paidAt < 946684800000 ||
      paidAt > Date.now() + 300000
    )
      throw new HttpError(400, "Invalid payment time");
    const customer =
      data.customer_details == null ? {} : object(data.customer_details);
    const result = await env.ORGANISATION.getByName("persevex").receiveCashfree(
      {
        environment: env.CASHFREE_ENV as CashfreePayment["environment"],
        verified,
        paymentId,
        orderId: text(order.order_id, 200, true),
        amountPaise: rupeesToPaise(
          typeof payment.payment_amount === "number"
            ? String(payment.payment_amount)
            : payment.payment_amount,
          "Payment amount",
        ),
        currency: "INR",
        paidAt,
        name: text(customer.customer_name, 200),
        email: text(customer.customer_email, 254),
        phone: text(customer.customer_phone, 32),
      },
    );
    return json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    return error instanceof HttpError
      ? json({ error: error.message }, error.status)
      : json({ error: "Payment receiver unavailable" }, 503);
  }
}
