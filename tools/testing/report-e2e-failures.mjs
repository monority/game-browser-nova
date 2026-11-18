#!/usr/bin/env node
// Turn a red E2E step into a named failure.
//
// `pnpm test:e2e` exits 1 and GitHub records "Process completed with exit code 1"
// — the journey's name is only in the artifact, which needs an authenticated
// download. Runs 95 and 97 were red with no way to say which of the 17 journeys
// broke. Workflow commands (`::error`) become annotations, and annotations are
// readable without a token, so this replays Playwright's JSON report into them.
//
// It never fails the build on its own: a missing report is a warning, because the
// original red step is the failure and this step only explains it.
import { readFileSync } from "node:fs";

const REPORT = "test-results/results.json";

const escape = (text) =>
  String(text).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

const firstLine = (text) => String(text ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";

/** Specs nest; a failing test can sit at any depth. */
function collect(suite, out = []) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const failed = (test.results ?? []).find((r) => r.status !== "passed" && r.status !== "skipped");
      if (failed) out.push({ file: spec.file ?? suite.file, title: spec.title, status: failed.status, error: failed.error });
    }
  }
  for (const child of suite.suites ?? []) collect(child, out);
  return out;
}

let report;
try {
  report = JSON.parse(readFileSync(REPORT, "utf8"));
} catch {
  console.log(`::warning::${REPORT} was not written — the failing journey names are unknown for this run.`);
  process.exit(0);
}

const failures = (report.suites ?? []).flatMap((suite) => collect(suite));
const stats = report.stats ?? {};
console.log(
  `E2E report: ${stats.expected ?? "?"} passed, ${stats.unexpected ?? "?"} unexpected, ` +
    `${stats.flaky ?? 0} flaky, ${stats.skipped ?? 0} skipped in ${report.suites?.length ?? 0} spec files.`,
);

if (failures.length === 0) {
  console.log("::warning::the report carries no failing test, yet the E2E step failed — suspect the server or the browser, not a journey.");
  process.exit(0);
}

for (const failure of failures) {
  const detail = firstLine(failure.error?.message);
  const message = `${failure.status}: ${failure.title}${detail ? ` — ${detail}` : ""}`;
  console.log(`::error file=${escape(failure.file)}::${escape(message)}`);
}
console.log(`::error::${failures.length} journey(s) failed: ${failures.map((f) => f.title).join(" | ")}`);
