#!/usr/bin/env node
/**
 * Agent play runner: loads tools/agent/play.ts through Vite so the CLI can
 * use the project's TypeScript sources and the `@/` alias exactly like the
 * app and the tests do (no vite-node, no extra dependency, no build step).
 *
 * Usage: node tools/agent/run.mjs [--json] [--quiet] [--window N]
 *                                 [--script <file.jsonl>]
 * Without --script, JSONL is read from stdin.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

function readStdin() {
  return new Promise((resolve) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      text += chunk;
    });
    process.stdin.on("end", () => resolve(text));
  });
}

const argv = process.argv.slice(2);
const scriptFlag = argv.indexOf("--script");
let input = "";
if (scriptFlag >= 0) {
  const path = argv[scriptFlag + 1];
  if (!path) {
    console.error("nova agent: --script needs a file path");
    process.exit(2);
  }
  input = readFileSync(path, "utf8");
} else if (!process.stdin.isTTY) {
  input = await readStdin();
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
try {
  const play = await server.ssrLoadModule("/tools/agent/play.ts");
  process.exitCode = await play.run({
    argv,
    input,
    readFile: (path) => readFileSync(path, "utf8"),
    writeFile: (path, text) => writeFileSync(path, text),
  });
} finally {
  await server.close();
}
