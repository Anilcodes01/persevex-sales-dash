import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";

try {
  const env = parseEnv(await readFile(".env", "utf8"));
  const accountId =
    env.CLOUDFLARE_ACCOUNT_ID || env.CLOUDFLARE_WORKERS_PAGES_ACCOUNT_ID;
  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId.trim())) {
    throw new Error(
      "Set a valid Cloudflare Account ID in .env under CLOUDFLARE_WORKERS_PAGES_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID.",
    );
  }
  const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  config.account_id = accountId.trim();
  await writeFile("wrangler.jsonc", JSON.stringify(config, null, 2) + "\n");
  console.log(
    "Wrangler configured with the Account ID from .env. No secrets were copied.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
