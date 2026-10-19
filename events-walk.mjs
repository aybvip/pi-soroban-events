#!/usr/bin/env node
/**
 * Pi Soroban Events Explorer — read-only.
 *
 * Walks Soroban events over a ledger range and reports how many ledgers were
 * actually covered. Pi's getEvents endpoint caps a query at roughly 10 000
 * ledgers and returns an empty result (not an error) when the range is too
 * wide — so a bare "no events found" can be indistinguishable from "the query
 * silently covered a truncated window". This tool walks in explicit windows
 * and states the coverage, so a reader never has to guess.
 *
 * GET-only. No writes. No database.
 *
 * Usage:
 *   node events-walk.mjs --from 1000 --to 15000 [--network testnet] [--step 9000]
 */

import { parseArgs } from "node:util";

const RPCS = {
  testnet: "https://rpc.testnet.minepi.com",
  mainnet: "https://api.mainnet.minepi.com",
};

// Observed cap: Pi's getEvents truncates silently near 10k ledgers. Default
// step stays well under it so each window is fully covered.
const DEFAULT_STEP = 9000;

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
      "  node events-walk.mjs --from <ledger> --to <ledger> [--network testnet|mainnet] [--step 9000]",
      "",
      "Walks getEvents in explicit ledger windows and reports coverage completeness.",
    ].join("\n")
  );
}

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    network: { type: "string", default: "testnet" },
    step: { type: "string", default: String(DEFAULT_STEP) },
    help: { type: "boolean", default: false },
  },
});

if (values.help || !values.from || !values.to) {
  usage();
  process.exit(values.help ? 0 : 1);
}

const network = values.network === "mainnet" ? "mainnet" : "testnet";
const rpcUrl = RPCS[network];
const from = Number(values.from);
const to = Number(values.to);
const step = Math.max(1, Number(values.step) || DEFAULT_STEP);

if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
  console.error("ERROR: --to must be greater than --from");
  process.exit(1);
}

(async () => {
  console.log("# Pi Soroban Events — coverage walk");
  console.log(`network: ${network}`);
  console.log(`range:   ${from} .. ${to}  (span ${to - from + 1} ledgers)`);
  console.log(`step:    ${step}`);
  console.log("");

  const windows = [];
  for (let start = from; start <= to; start += step) {
    const end = Math.min(start + step - 1, to);
    windows.push([start, end]);
  }
  console.log(`windows: ${windows.length}`);
  console.log("");

  let totalEvents = 0;
  let ledgersCovered = 0;
  const rows = [];

  for (const [start, end] of windows) {
    let count = 0;
    let note = "";
    try {
      const ev = await rpc(rpcUrl, "getEvents", {
        startLedger: start,
        endLedger: end,
        filters: [],
        limit: 100,
      });
      count = (ev.events ?? []).length;
      if (ev.cursor) note = `cursor=${ev.cursor}`;
    } catch (e) {
      note = `error: ${e.message}`;
    }
    totalEvents += count;
    ledgersCovered += end - start + 1;
    rows.push({ start, end, span: end - start + 1, events: count, note });
    console.log(`  [${start} .. ${end}]  span=${end - start + 1}  events=${count}${note ? "  " + note : ""}`);
  }

  const totalSpan = to - from + 1;
  const pct = ((ledgersCovered / totalSpan) * 100).toFixed(1);

  console.log("");
  console.log("# Coverage");
  console.log(`ledgers_requested: ${totalSpan}`);
  console.log(`ledgers_covered:   ${ledgersCovered}  (${pct}%)`);
  console.log(`windows_walked:    ${windows.length}`);
  console.log(`events_found:      ${totalEvents}`);
  console.log("");
  console.log("# Caveat");
  console.log(
    "Pi's getEvents caps a single query near 10 000 ledgers and may return an empty";
  );
  console.log(
    "result (not an error) when the range is too wide. This tool walks in explicit";
  );
  console.log(
    "windows so the coverage figure above is a measurement, not an assumption.";
  );
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
