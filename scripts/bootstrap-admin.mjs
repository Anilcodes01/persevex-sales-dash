import { readFile } from 'node:fs/promises';

async function main() {
  const [origin, credentialsFile] = process.argv.slice(2);
  if (!origin || !credentialsFile) {
    throw new Error('Usage: node scripts/bootstrap-admin.mjs <origin> <private-credentials-json>');
  }
  let url;
  try { url = new URL(origin); }
  catch { throw new Error('Provide a valid origin, such as http://localhost:8787.'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Use HTTPS, or localhost for development.');
  }
  let credentials;
  try { credentials = JSON.parse(await readFile(credentialsFile, 'utf8')); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('The credentials file is not valid JSON. Use double-quoted keys and values, with no trailing commas.');
    throw new Error('Cannot read the credentials file. Check its path.');
  }
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
    throw new Error('The credentials file must contain a JSON object.');
  }
  if (typeof credentials.displayName !== 'string' || !credentials.displayName.trim()) {
    throw new Error('Provide "displayName" with that exact capitalisation in the credentials file.');
  }
  if (typeof credentials.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email.trim())) {
    throw new Error('Provide a valid "email" in the credentials file.');
  }
  if (typeof credentials.secret !== 'string' || !credentials.secret) {
    throw new Error('Provide "secret" matching BOOTSTRAP_ADMIN_SECRET in .dev.vars.');
  }
  if (typeof credentials.password !== 'string' || credentials.password.length < 15 || credentials.password.length > 128) {
    throw new Error('The administrator password must contain 15–128 characters.');
  }
  let response;
  try {
    response = await fetch(new URL('/api/auth/bootstrap', url), {
      method: 'POST', headers: { Origin: url.origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials), signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error(`Cannot reach ${url.origin}. Start "npm run cf:dev" in another terminal, wait for Wrangler's "Ready" message, then retry with the URL it prints.`);
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('The server did not return JSON. Use the Cloudflare runtime URL, not the Next.js-only development server.'); }
  if (!response.ok) {
    if (response.status === 403) throw new Error('Setup unavailable. Check that "secret" matches BOOTSTRAP_ADMIN_SECRET in .dev.vars, and restart cf:dev after changing that file.');
    throw new Error(result.error || `Setup failed (HTTP ${response.status}).`);
  }
  console.log('Administrator created. Sign in through the application.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
