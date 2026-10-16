import { spawn } from "node:child_process";
import { writeFile, access } from "node:fs/promises";
import { readWranglerConfig } from "./read-wrangler-config.mjs";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.some((arg) => !["--backend-only", "--check"].includes(arg))) {
  console.error("Usage: node scripts/dev.mjs [--backend-only] [--check]");
  process.exit(1);
}
const backendOnly = args.includes("--backend-only");
const children = new Set();
let stopping = false;
let exitCode = 0;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) child.kill("SIGINT");
  const timer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 5000);
  timer.unref();
  if (!children.size) process.exitCode = exitCode;
}
function start(label, entry, cliArgs) {
  const child = spawn(process.execPath, [entry, ...cliArgs], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  });
  children.add(child);
  child.on("error", (error) => {
    console.error(`${label} could not start: ${error.message}`);
    stop(1);
  });
  child.on("close", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(
        `${label} stopped (${signal || code}). Stopping the other process.`,
      );
      stop(code || (signal ? 1 : 0));
    }
    if (!children.size) process.exitCode = exitCode;
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

try {
  const config = await readWranglerConfig(path.join(root, "wrangler.jsonc"));
  // Generate from production config so bindings/class migrations cannot drift.
  // This file stays next to .dev.vars; local account/session storage is shared
  // with cf:dev through the same Worker identity and persistence directory.
  config.assets = { ...config.assets, directory: "./public" };
  config.vars = {
    ...config.vars,
    LOCAL_DEVELOPMENT: "true",
    DEV_FRONTEND_ORIGIN: "http://localhost:3000",
  };
  const configFile = path.join(root, ".wrangler.dev.json");
  const wrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js");
  const next = path.join(root, "node_modules/next/dist/bin/next");
  await access(wrangler, constants.R_OK);
  await access(next, constants.R_OK);
  await writeFile(configFile, JSON.stringify(config, null, 2) + "\n");
  if (args.includes("--check")) {
    console.log("Development configuration prepared. No servers started.");
  } else {
    console.log("Local backend: http://127.0.0.1:8787");
    if (!backendOnly)
      console.log(
        "Open the hot-reloading UI at http://localhost:3000. Ctrl+C stops both processes.",
      );
    start("Wrangler", wrangler, [
      "dev",
      "--local",
      "--config",
      configFile,
      "--ip",
      "127.0.0.1",
      "--port",
      "8787",
      "--persist-to",
      path.join(root, ".wrangler/state"),
    ]);
    if (!backendOnly)
      start("Next.js", next, [
        "dev",
        "--webpack",
        "--hostname",
        "localhost",
        "--port",
        "3000",
      ]);
  }
} catch (error) {
  console.error(`Development setup failed: ${error.message}`);
  stop(1);
}
