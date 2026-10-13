import { scrypt } from "@noble/hashes/scrypt.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

// OWASP's scrypt profile: N=2^14, r=8, p=5 (~16 MiB workspace).
// Run inside the Durable Object, not the Free Worker's 10ms CPU budget.
const options = { N: 16384, r: 8, p: 5, dkLen: 32, maxmem: 32 * 1024 * 1024 };
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
export const COOKIE = "__Host-persevex_session";

export function randomToken() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function equal(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return difference === 0;
}

export function hashPassword(password: string) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  return `scrypt-v1$${salt}$${bytesToHex(scrypt(password, hexToBytes(salt), options))}`;
}

export function verifyPassword(password: string, encoded: string) {
  const [scheme, salt, expected] = encoded.split("$");
  if (
    scheme !== "scrypt-v1" ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{64}$/.test(expected)
  )
    return false;
  return equal(
    bytesToHex(scrypt(password, hexToBytes(salt), options)),
    expected,
  );
}

// A valid fixed hash gives unknown accounts the same expensive verification path.
export const DUMMY_HASH =
  "scrypt-v1$00000000000000000000000000000000$" + "0".repeat(64);

export async function digest(value: string) {
  return bytesToHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}

export function sessionCookie(token: string, maxAge = SESSION_SECONDS) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function readSession(request: Request) {
  const value = request.headers
    .get("Cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 6 && value.length <= 128;
}

export function normaliseEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}
