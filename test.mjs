import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  splitWindows,
  coveredLedgers,
  coveragePct,
  windowsAreSane,
  clampRange,
  isTruncated,
  DEFAULT_STEP,
  RETENTION_LEDGERS,
  PAGE_CAP,
} from "./windows.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "events-walk.mjs");

function run(args) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", stdio: "pipe" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

// --- pure window arithmetic -------------------------------------------------

test("a range shorter than one step is a single window", () => {
  assert.deepEqual(splitWindows(100, 200, 9000), [[100, 200]]);
});

test("an exact multiple of the step splits cleanly", () => {
  assert.deepEqual(splitWindows(1, 30, 10), [[1, 10], [11, 20], [21, 30]]);
});

test("the final window is clipped to `to`", () => {
  assert.deepEqual(splitWindows(1, 25, 10), [[1, 10], [11, 20], [21, 25]]);
});

test("a single-ledger range yields one one-ledger window", () => {
  assert.deepEqual(splitWindows(7, 7, 9000), [[7, 7]]);
});

test("windows tile the range with no gaps and no overlap", () => {
  const from = 500;
  const to = 25000;
  assert.equal(windowsAreSane(splitWindows(from, to, 9000), from, to), true);
});

test("covered ledgers equals the requested span", () => {
  const from = 1;
  const to = 14001;
  const w = splitWindows(from, to, DEFAULT_STEP);
  assert.equal(coveredLedgers(w), to - from + 1);
  assert.equal(coveragePct(w, from, to), 100);
});

test("coverage of a partial window list is proportional", () => {
  const w = splitWindows(1, 50, 10).slice(0, 2);
  assert.equal(coveragePct(w, 1, 50), 40);
});

test("to < from throws", () => {
  assert.throws(() => splitWindows(10, 1, 5), /to must be/);
});

test("step < 1 throws", () => {
  assert.throws(() => splitWindows(1, 10, 0), /step must be/);
});

test("non-finite inputs throw", () => {
  assert.throws(() => splitWindows(NaN, 10, 5), /finite/);
  assert.throws(() => splitWindows(1, Infinity, 5), /finite/);
});

test("windowsAreSane rejects an overlapping list", () => {
  assert.equal(windowsAreSane([[1, 10], [10, 20]], 1, 20), false);
});

test("windowsAreSane rejects a window outside the range", () => {
  assert.equal(windowsAreSane([[1, 30]], 1, 20), false);
});

// --- measured constants -----------------------------------------------------

test("retention constant is the measured 120 960 ledgers (7 days at 5 s)", () => {
  assert.equal(RETENTION_LEDGERS, 120960);
  assert.equal(RETENTION_LEDGERS * 5, 7 * 24 * 60 * 60);
});

test("page cap is the observed 100 events per response", () => {
  assert.equal(PAGE_CAP, 100);
});

// --- retention clipping -----------------------------------------------------

test("clampRange leaves an in-window range untouched", () => {
  const r = clampRange(1000, 2000, 900, 3000);
  assert.deepEqual(r, { start: 1000, end: 2000, ok: true, clippedStart: false, clippedEnd: false });
});

test("clampRange clips a start below the retention floor", () => {
  const r = clampRange(100, 2000, 900, 3000);
  assert.equal(r.start, 900);
  assert.equal(r.clippedStart, true);
  assert.equal(r.ok, true);
});

test("clampRange clips an end beyond latest", () => {
  const r = clampRange(1000, 9999, 900, 3000);
  assert.equal(r.end, 3000);
  assert.equal(r.clippedEnd, true);
  assert.equal(r.ok, true);
});

test("clampRange reports not-ok when the range is entirely before retention", () => {
  const r = clampRange(1, 50, 900, 3000);
  assert.equal(r.ok, false);
});

test("clampRange reports not-ok when the range is entirely after latest", () => {
  const r = clampRange(4000, 5000, 900, 3000);
  assert.equal(r.ok, false);
});

test("clampRange rejects non-finite input", () => {
  assert.throws(() => clampRange(NaN, 2, 1, 3), /finite/);
});

// --- truncation detection ---------------------------------------------------

test("a 100-event page is truncated", () => {
  assert.equal(isTruncated(100), true);
});

test("99 events is not truncated, 101 is", () => {
  assert.equal(isTruncated(99), false);
  assert.equal(isTruncated(101), true);
});

test("a caller-supplied cap is respected", () => {
  assert.equal(isTruncated(10, 10), true);
  assert.equal(isTruncated(9, 10), false);
});

// --- CLI --------------------------------------------------------------------

test("--help exits 0", () => {
  assert.equal(run(["--help"]).code, 0);
});

test("missing --from exits 1", () => {
  assert.equal(run(["--to", "10"]).code, 1);
});

test("--to < --from exits 1", () => {
  assert.equal(run(["--from", "10", "--to", "5"]).code, 1);
});

test("--network mainnet refuses with a measured explanation and exits 2", () => {
  const r = run(["--from", "1", "--to", "10", "--network", "mainnet"]);
  assert.equal(r.code, 2);
  assert.match(r.out, /no public Soroban RPC/i);
  assert.match(r.out, /HTTP 503/);
  assert.match(r.out, /--rpc/);
});

test("--network mainnet never claims to have queried anything", () => {
  const r = run(["--from", "1", "--to", "10", "--network", "mainnet"]);
  assert.doesNotMatch(r.out, /events_found/);
});

test("--dry-run prints windows and 100% coverage with no network", () => {
  const r = run(["--from", "1", "--to", "14001", "--dry-run"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /windows: 2/);
  assert.match(r.out, /ledgers_covered:\s+14001\s+\(100%/);
  assert.match(r.out, /not queried/);
});

test("--dry-run with an exact multiple yields the right window count", () => {
  const r = run(["--from", "1", "--to", "30", "--step", "10", "--dry-run"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /windows: 3/);
});

test("--dry-run window bounds are printed verbatim", () => {
  const r = run(["--from", "100", "--to", "250", "--step", "100", "--dry-run"]);
  assert.match(r.out, /\[100 \.\. 199\]\s+span=100/);
  assert.match(r.out, /\[200 \.\. 250\]\s+span=51/);
});

test("--dry-run reaches 100% coverage for every range shape", () => {
  for (const [from, to, step] of [[1, 1, 9000], [1, 9, 3], [5, 100, 7], [1, 99999, 9000]]) {
    const r = run(["--from", String(from), "--to", String(to), "--step", String(step), "--dry-run"]);
    assert.match(r.out, /\(100%/, `range ${from}..${to} step ${step}`);
  }
});

test("--rpc overrides the endpoint in the header without a mainnet refusal", () => {
  const r = run(["--from", "1", "--to", "10", "--network", "mainnet", "--rpc", "https://example.invalid", "--dry-run"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /example\.invalid/);
});

test("--dry-run does not print a truncation claim (nothing was queried)", () => {
  const r = run(["--from", "1", "--to", "10", "--dry-run"]);
  assert.match(r.out, /windows_truncated: 0/);
});
