import { readFile } from "node:fs/promises";
import ts from "typescript";

export function parseWranglerConfig(source, filename = "wrangler.jsonc") {
  const { config, error } = ts.parseConfigFileTextToJson(filename, source);
  if (error) {
    const location = error.file && error.start !== undefined
      ? error.file.getLineAndCharacterOfPosition(error.start)
      : null;
    const position = location ? `:${location.line + 1}:${location.character + 1}` : "";
    throw new Error(`${filename}${position}: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`);
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`${filename}: expected a configuration object`);
  }
  return config;
}

export async function readWranglerConfig(filename) {
  return parseWranglerConfig(await readFile(filename, "utf8"), filename);
}
