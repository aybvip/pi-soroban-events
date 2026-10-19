#!/usr/bin/env node
/**
 * Pi Soroban Events Explorer — read-only.
 *
 * Walks Soroban events over a ledger range and reports, per window, how many
 * events the RPC returned and whether that window hit the observed per-response
 * cap. The point is to make truncation VISIBLE instead of silent.
 *
 * Measured on https://rpc.testnet.minepi.com, 2026-10-19, protocol 28:
 *
 *   - There is no ~10 000-ledger span cap. A 100 000-ledger span succeeded.
 *   - getEvents returns at most 100 events per response, and `limit` is ignored.
 *   - The returned `cursor` is not honoured, so a 100-event page cannot be
 *     continued. Any window with >= 100 events is truncated.
 *   - `startLedger` below the current oldest ledger is a -32600 error, not an
 *     empty array. The retention window is 120 960 ledgers (7 days at 5 s).
 *   - `endLedger` beyond latest is clamped silently.
 *
 * GET-only. No writes. No database.
 *
 * Usage:
 *   node events-walk.mjs --from <ledger> --to <ledger> [--step 9000]
 *   node events-walk.mjs --from <ledger> --to <ledger> --dry-run     (no network)
 *   node events-walk.mjs --from <ledger> --to <ledger> --rpc <url>
 */

import { parseArgs } from "node:util";
import {
  splitWindows,
  coveredLedgers,
  coveragePct,
  clampRange,
  isTruncated,
  DEFAULT_STEP,
  PAGE_CAP,
} from "./windows.mjs";

const SOROBAN_RPC = {
  testnet: "https://rpc.testnet.minepi.com",
  // No public Soroban RPC exists on Mainnet as of 2026-10-19:
  // rpc.mainnet.minepi.com and soroban-rpc.mainnet.minepi.com both answer
  // HTTP 503 and serve a certificate that expired 2023-05-30.
  mainnet: null,
};

async function rpc(rpcUrl, method, params = {}) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result;
}

function usage() {
  console.log(
    [
      "Pi Soroban Events Explorer",
      "",
      "  node events-walk.mjs --from <ledger> --to <ledger> [--step 9000]",
      "  node events-walk.mjs --from <ledger> --to <ledger> --dry-run",
      "  node events-walk.mjs --from <ledger> --to <ledger> --rpc <url>",
      "",
      "Walks getEvents in explicit ledger windows and reports per-window",
      "truncation. A window that returns 100 events is reported as TRUNCATED",
      "because this RPC ignores `limit` and does not honour its own cursor.",
      "",
      "Mainnet has no public Soroban RPC (measured 2026-10-19). Use --rpc to",
      "point at another endpoint if one becomes available.",
    ].join("\n")
  );
}

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    network: { type: "string", default: "testnet" },
    rpc: { type: "string" },
    step: { type: "string", default: String(DEFAULT_STEP) },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help || !values.from || !values.to) {
  usage();
  process.exit(values.help ? 0 : 1);
}

const network = values.network === "mainnet" ? "mainnet" : "testnet";
let rpcUrl = values.rpc ?? SOROBAN_RPC[network];

if (!rpcUrl) {
  console.error(
    [
      `ERROR: no public Soroban RPC is known for network "${network}".`,
      "",
      "Measured 2026-10-19:",
      "  rpc.mainnet.minepi.com        -> HTTP 503 (no healthy backend)",
      "  soroban-rpc.mainnet.minepi.com -> HTTP 503 (no healthy backend)",
      "  both serve a certificate that expired 2023-05-30",
      "",
      "Mainnet exposes a REST (Horizon) API at https://api.mainnet.minepi.com,",
      "but that is not a Soroban JSON-RPC endpoint. Use --rpc <url> to target a",
      "different endpoint, or --network testnet (the only measured Soroban RPC).",
    ].join("\n")
  );
  process.exit(2);
}

const from = Number(values.from);
const to = Number(values.to);
const step = Math.max(1, Number(values.step) || DEFAULT_STEP);

if (!Number.isFinite(from) || !Number.isFinite(to)) {
  console.error("ERROR: --from and --to must be numbers");
  process.exit(1);
}
if (to < from) {
  console.error("ERROR: --to must be >= --from");
  process.exit(1);
}

const windows = splitWindows(from, to, step);

async function printHealth() {
  const h = await rpc(rpcUrl, "getHealth");
  return { oldest: Number(h.oldestLedger), latest: Number(h.latestLedger) };
}

function printCoverage(covered, truncated, errored) {
  console.log("");
  console.log("# Coverage");
  console.log(`ledgers_requested: ${to - from + 1}`);
  console.log(`ledgers_covered:   ${covered}  (${coveragePct(windows, from, to)}% of the request)`);
  console.log(`windows_walked:    ${windows.length}`);
  console.log(`windows_truncated: ${truncated}  (>= ${PAGE_CAP} events in one response)`);
  console.log(`windows_errored:   ${errored}`);
}

(async () => {
  console.log("# Pi Soroban Events — coverage walk");
  console.log(`network: ${network}`);
  console.log(`rpc:     ${rpcUrl}`);
  console.log(`range:   ${from} .. ${to}  (span ${to - from + 1} ledgers)`);
  console.log(`step:    ${step}`);
  console.log("");

  if (values["dry-run"]) {
    console.log(`windows: ${windows.length}`);
    console.log("");
    for (const [a, b] of windows) {
      console.log(`  [${a} .. ${b}]  span=${b - a + 1}`);
    }
    printCoverage(coveredLedgers(windows), 0, 0);
    console.log(`events_found:      0  (dry-run, not queried)`);
    return;
  }

  const { oldest, latest } = await printHealth();
  console.log(`retention: oldest=${oldest} latest=${latest} span=${latest - oldest + 1}`);

  const clipped = clampRange(from, to, oldest, latest);
  if (!clipped.ok) {
    console.error(
      `\nERROR: the requested range lies outside the current retention window.\n` +
        `  requested: ${from} .. ${to}\n` +
        `  available: ${oldest} .. ${latest}\n` +
        `  ledger retention is 120 960 ledgers (7 days at 5 s per ledger).\n` +
        `  nothing was queried.`
    );
    process.exit(2);
  }
  if (clipped.clippedStart || clipped.clippedEnd) {
    console.log(
      `note: range clipped to the retention window -> ${clipped.start} .. ${clipped.end}`
    );
  }

  const activeWindows = splitWindows(clipped.start, clipped.end, step);
  let totalEvents = 0;
  let truncated = 0;
  let errored = 0;
  let covered = 0;

  for (const [start, end] of activeWindows) {
    // Retention slides forward while we walk. Re-read the floor per window so
    // a long run cannot silently fall off the start of history.
    let floor = oldest;
    try {
      floor = (await printHealth()).oldest;
    } catch {
      /* keep the previous floor */
    }

    const s = Math.max(start, floor);
    if (s > end) {
      console.log(`  [${start} .. ${end}]  SKIPPED (fell outside retention)`);
      continue;
    }

    let count = 0;
    let note = "";
    let didError = false;
    try {
      const ev = await rpc(rpcUrl, "getEvents", {
        startLedger: s,
        // MEASURED: endLedger is EXCLUSIVE on Pi's RPC. [L, L] returns zero
        // events while [L, L+1] returns the events of ledger L. Always send
        // end + 1 so the final ledger of the window is actually included.
        endLedger: end + 1,
        filters: [],
        limit: PAGE_CAP,
      });
      count = (ev.events ?? []).length;
      totalEvents += count;
      covered += end - s + 1;
      if (isTruncated(count)) {
        truncated++;
        note = `  TRUNCATED (cap=${PAGE_CAP}; cursor not honoured, cannot continue)`;
      }
    } catch (e) {
      errored++;
      didError = true;
      note = `  ERROR: ${e.message}`;
    }

    console.log(
      `  [${s} .. ${end}]  span=${end - s + 1}  events=${didError ? "?" : count}${note}`
    );
  }

  printCoverage(covered, truncated, errored);
  console.log(`events_found:      ${totalEvents}${truncated > 0 ? "  (LOWER BOUND — truncated windows)" : ""}`);
  console.log("");
  console.log("# Measured constraints (2026-10-19, protocol 28)");
  console.log("  - No ~10 000-ledger span cap: a 100 000-ledger span succeeded.");
  console.log("  - At most 100 events per response; `limit` is ignored.");
  console.log("  - The returned `cursor` is not honoured, so a 100-event page cannot");
  console.log("    be continued. Such a window is reported as TRUNCATED above.");
  console.log("  - `endLedger` is EXCLUSIVE: [L, L] returns nothing, [L, L+1] returns");
  console.log("    ledger L. This walker sends end+1 so the last ledger is included.");
  console.log("  - `filters` accepts only type 'system' or 'contract'; filtering by");
  console.log("    transaction hash is not supported by this RPC.");
  console.log("  - `startLedger` below the current oldest ledger is a -32600 error.");
  console.log("  - Retention is 120 960 ledgers (7 days at 5 s per ledger).");
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
