/**
 * Test vacuity audit: finds tests that cannot fail.
 *
 * Why it exists: the mutation probe measures what the suite CATCHES, but it
 * cannot see a test that asserts nothing at all — such a test still counts as
 * passing, so a broken law "would" fail in it. Two real cases were found by
 * hand before this script existed (2026-11-14): a road rejection behind
 * `if (blocked)` that would have asserted nothing on a seed without blocked
 * terrain, and an event test that dispatched on the kind the seed drew,
 * checking neither effect when it drew a third.
 *
 * Rules:
 *   R1 empty describe     — a block that contains no test
 *   R2 no assertion       — a test whose body never asserts
 *   R3 skip / only / todo — a test that does not run, or one that hides the rest
 *   R4 conditional expect — an assertion that only runs on one branch
 *   R5 unguarded loop     — a loop that asserts over a computed collection
 *                           whose emptiness nothing pinned
 *   R6 unguarded `every`  — `every()` is vacuously true on an empty list
 *
 * Scope: `tests/` (vitest laws) and `e2e/` (Playwright journeys) — same rules,
 * because nothing about vacuity is specific to a runner.
 *
 * Usage:
 *   node tools/testing/audit-vacuity.mjs            # both suites
 *   node tools/testing/audit-vacuity.mjs --verbose  # every file, not just hits
 *   node tools/testing/audit-vacuity.mjs --selftest # prove the rules still fire
 *
 * Exit codes: 0 clean, 1 findings, 2 the audit itself failed.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** Both suites: the unit laws and the browser journeys. Same rules apply. */
const SUITES = ["tests", "e2e"];
const VERBOSE = process.argv.includes("--verbose");

/** Patterns that count as pinning the size of a collection. */
const PIN =
  /toHaveLength|\.length\s*\)\s*\.(toBe|toEqual|toBeGreaterThan|toBeGreaterThanOrEqual|toBeLessThan)|not\.toHaveLength\(0\)|not\.toBeEmpty/;
/** Patterns that count as an assertion of any kind. */
const ASSERTS = /expect\s*\(|\bassert\b|toThrow|rejects|throw new Error/;

/**
 * Returns the text from an opening bracket to its matching close, brackets
 * included. Counting all three kinds means a `[` inside a call cannot end the
 * body early.
 */
function balanced(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return text.slice(openIndex, i + 1);
    }
  }
  return text.slice(openIndex);
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/**
 * Comments blanked out, everything else untouched, lengths preserved.
 *
 * Why: the detectors below match `describe(`, `it(` and `test(` by text, and
 * English prose says "it (pressure, crisis bills)" — which the scanner read as
 * an anonymous `it` call, whose body was the prose itself, so a real test's
 * neighbour was reported as asserting nothing (measured 2026-11-17 on the
 * Step084 guard). A comment cannot assert, so it is not part of the test: the
 * characters become spaces and every offset a finding reports stays exact.
 */
function stripComments(src) {
  let out = "";
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += src[i + 1] ?? "";
        i++;
      } else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i++;
      }
      out += "\n";
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

/**
 * Every `describe(...)` / `it(...)` / `test(...)` call in a file, with
 * `test.describe(...)` folded into `describe`.
 *
 * The body is everything AFTER the name literal, not the last `{...}` group:
 * an arrow body contains nested braces (object literals, callbacks), so
 * searching for the final `{` lands inside the body instead of on its start.
 */
function blocks(src) {
  const found = [];
  const re = /\b(describe|it|test)(\.\w+)?\s*\(/g;
  let match;
  while ((match = re.exec(src))) {
    let openParen = src.indexOf("(", match.index);
    // `it.skipIf(cond)(name, fn)` (and `it.each(table)(name, fn)`, `it.fails(...)`)
    // spell the modifier as a call of its own: the first parenthesis group holds
    // the modifier's arguments, the declaration's follow. Reading the first one
    // as the declaration made a real, asserting test look anonymous and
    // assertion-free (measured 2026-11-20 on `it.skipIf(!ENABLED)`).
    if (/^\.(skipIf|runIf|fails|each)$/.test(match[2] ?? "")) {
      const modifierArgs = balanced(src, openParen);
      const nextParen = src.indexOf("(", openParen + modifierArgs.length);
      if (nextParen >= 0) openParen = nextParen;
    }
    const args = balanced(src, openParen); // starts with "("
    const inner = args.slice(1);
    const nameMatch = /^\s*(["'`])(.*?)\1\s*/.exec(inner);
    const afterName = nameMatch ? nameMatch[0].length : 0;
    // Playwright spells a describe block `test.describe(...)`: it is a group,
    // not a test, so judging its body for assertions would be judging the
    // nested tests as one, and counting it would inflate the denominator.
    const modifiers = match[2] ?? "";
    const isDescribe = match[1] === "describe" || modifiers.includes(".describe");
    found.push({
      kind: isDescribe ? "describe" : "test",
      modifier: modifiers.replace(".describe", ""),
      name: nameMatch?.[2] ?? "(anonymous)",
      line: lineOf(src, match.index),
      body: inner.slice(afterName),
      start: openParen + 1 + afterName,
      end: openParen + args.length - 1,
    });
  }
  return found;
}

/**
 * R5 candidates: loops that ASSERT over a computed collection (`fn(...)` or
 * `x.y`) whose emptiness would make the whole loop vacuous. Loops that only
 * build a set or a report are not assertions and stay unreported, as do array
 * literals and local arrays built by `push` (finite by construction).
 */
function assertingLoops(body) {
  const loops = [];
  const re = /for\s*\(/g;
  let match;
  while ((match = re.exec(body))) {
    const openParen = body.indexOf("(", match.index);
    const header = balanced(body, openParen);
    const iterable = /\bof\s+([\s\S]+)$/.exec(header.slice(1, -1))?.[1]?.trim();
    if (!iterable) continue; // `for (let i = 0; ...)` — a counter, not a collection
    if (iterable.startsWith("[")) continue;
    if (!/[).]/.test(iterable)) continue; // a local array built by push
    const bodyOpen = body.indexOf("{", openParen + header.length);
    const loopBody = bodyOpen === -1 ? "" : balanced(body, bodyOpen);
    if (!ASSERTS.test(loopBody)) continue;
    loops.push({ expression: iterable, index: match.index ?? 0 });
  }
  return loops;
}

/** Audits one source text and returns its findings (no side effects). */
function auditSource(file, src) {
  const findings = [];
  const report = (rule, at, message) => findings.push({ rule, file, line: at, message });
  const entries = blocks(stripComments(src));

  for (const entry of entries) {
    if (entry.kind === "describe") {
      const inner = entries.filter(
        (other) => other.kind !== "describe" && other.start > entry.start && other.end <= entry.end,
      );
      if (inner.length === 0) report("R1", entry.line, `describe "${entry.name}" contains no test`);
      if (/^\.(skip|todo|only)$/.test(entry.modifier)) {
        report("R3", entry.line, `describe${entry.modifier} "${entry.name}"`);
      }
      continue;
    }

    if (/^\.(skip|todo|only)$/.test(entry.modifier)) {
      report("R3", entry.line, `it${entry.modifier} "${entry.name}"`);
      continue; // a skipped test is not additionally judged
    }
    if (!ASSERTS.test(entry.body)) {
      report("R2", entry.line, `it "${entry.name}" never asserts`);
      continue;
    }

    // R4: `if` branches that assert, where the other side has no assertion.
    // An `if/else` with assertions in both arms always runs one of them.
    // The condition is read by bracket counting, not by matching to the first
    // `)`: Playwright conditions are full of calls (`if (await page
    // .locator("li").isVisible())`), and a regex stopped at the first inner
    // `)` — so every browser-shaped conditional was invisible to this rule.
    for (const match of entry.body.matchAll(/\bif\s*\(/g)) {
      const index = match.index ?? 0;
      const openParen = entry.body.indexOf("(", index);
      const condition = balanced(entry.body, openParen);
      let cursor = openParen + condition.length;
      while (/\s/.test(entry.body[cursor] ?? "")) cursor++;
      if (entry.body[cursor] !== "{") continue; // unbraced body: not judged
      const branch = balanced(entry.body, cursor);
      if (!ASSERTS.test(branch)) continue;
      const after = entry.body.slice(cursor + branch.length);
      const elseBranch = /^\s*else\s*\{/.exec(after);
      if (elseBranch) {
        const elseOpen = after.indexOf("{", elseBranch.index);
        if (ASSERTS.test(balanced(after, elseOpen))) continue;
      }
      report("R4", lineOf(src, entry.start + index), `it "${entry.name}": assertion behind a conditional that may never run`);
    }

    // R5: loops over a computed collection require a length pin.
    if (!PIN.test(entry.body)) {
      for (const loop of assertingLoops(entry.body)) {
        report("R5", entry.line, `it "${entry.name}": loop over "${loop.expression}" with no length pin`);
      }
    }

    // R6: `every()` INSIDE an assertion, on a collection nobody pinned.
    // A `[...].every(...)` in control flow is not an assertion (`if (cells
    // .every(free))`), and an array literal cannot be empty.
    for (const match of entry.body.matchAll(/expect\s*\(/g)) {
      const openParen = entry.body.indexOf("(", match.index);
      const asserted = balanced(entry.body, openParen);
      for (const every of asserted.matchAll(/([\w.)\]]+)\.every\s*\(/g)) {
        if (every[1].trim().startsWith("[")) continue;
        const before = entry.body.slice(0, match.index);
        if (!PIN.test(before)) {
          report("R6", lineOf(src, entry.start + match.index), `it "${entry.name}": every() past an unpinned collection`);
        }
      }
    }
  }
  return findings;
}

// --------------------------------------------------------------- the audit

/** Every spec under a suite directory, recursively (e2e/ has subdirectories). */
function specFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(test|spec)\.tsx?$/.test(name)) found.push(full);
    }
  };
  walk(join(ROOT, dir));
  return found;
}

function runAudit() {
  const files = SUITES.flatMap(specFiles).sort();
  const findings = [];
  let declarations = 0;
  for (const full of files) {
    const name = full.slice(ROOT.length + 1);
    const src = readFileSync(full, "utf8");
    const declared = blocks(stripComments(src)).filter((entry) => entry.kind !== "describe").length;
    declarations += declared;
    findings.push(...auditSource(name, src));
    if (VERBOSE) console.log(`${name} — ${declared} test(s)`);
  }
  if (findings.length > 0) {
    findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    for (const finding of findings) {
      console.log(`${finding.rule}  ${finding.file}:${finding.line}  ${finding.message}`);
    }
  }
  console.log(
    `\n${files.length} file(s) · ${declarations} test declaration(s) · ${findings.length} finding(s)` +
      (findings.length === 0 ? " — no test here passes by construction" : ""),
  );
  process.exit(findings.length > 0 ? 1 : 0);
}

// ------------------------------------------------------------ self-test

/**
 * A detector that stops detecting is indistinguishable from a clean suite, so
 * each rule is exercised on a fixture that MUST trip it, plus one clean
 * fixture that must stay silent.
 */
function selftest() {
  const cases = [
    ["R1", 'describe("empty", () => {\n});'],
    ["R2", 'it("no assert", () => {\n  compute();\n});'],
    ["R3", 'it.skip("skipped", () => {\n  expect(1).toBe(1);\n});'],
    ["R4", 'it("branch", () => {\n  if (flag) {\n    expect(a).toBe(1);\n  }\n  expect(b).toBe(2);\n});'],
    ["R5", 'it("loop", () => {\n  for (const x of load()) {\n    expect(x).toBe(1);\n  }\n});'],
    [
      "R4",
      'test("browser branch", async ({ page }) => {\n  if (await page.locator("li").isVisible()) {\n    await expect(page.locator("li")).toBeVisible();\n  }\n  await expect(page).toHaveTitle("x");\n});',
    ],
    ["R6", 'it("every", () => {\n  expect(list.every((x) => x.ok)).toBe(true);\n});'],
    ["R1", 'test.describe("empty group", () => {\n});'],
    [null, 'test.describe("group", () => {\n  test("nested", () => {\n    expect(1).toBe(1);\n  });\n});'],
    [
      null,
      'it("prose in a comment", () => {\n  // The triage priced it (pressure, bills) and it was harmless.\n  expect(1).toBe(1);\n});',
    ],
    [
      null,
      'it("url in a string", () => {\n  const doc = "https://example.com/it(";\n  expect(doc).toHaveLength(22);\n});',
    ],
    [
      null,
      'it.skipIf(flag)("conditionally skipped but real", () => {\n  expect(1).toBe(1);\n});',
    ],
    [null, 'it("clean", () => {\n  const all = load();\n  expect(all).toHaveLength(2);\n  if (a) {\n    expect(b).toBe(1);\n  } else {\n    expect(b).toBe(2);\n  }\n  for (const x of all) {\n    expect(x).toBe(1);\n  }\n});'],
  ];
  let failed = 0;
  for (const [expected, source] of cases) {
    const found = auditSource("selftest.ts", source).map((finding) => finding.rule);
    const ok = expected === null ? found.length === 0 : found.includes(expected);
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} expected ${expected ?? "no finding"} → got ${found.join(",") || "none"}`);
  }
  console.log(`\n${cases.length - failed}/${cases.length} fixture(s) behaved`);
  process.exit(failed > 0 ? 1 : 0);
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else runAudit();
} catch (error) {
  console.error(`audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
