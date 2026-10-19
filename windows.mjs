/**
 * Pure window arithmetic and retention math for the event walker. No I/O.
 *
 * Measured against https://rpc.testnet.minepi.com on 2026-10-19
 * (protocol 28, pi-horizon 28.0.1):
 *
 *   getHealth        oldestLedger .. latestLedger spanned exactly 120 960
 *                    ledgers, i.e. 7 days at the 5 s ledger close time.
 *   getEvents        accepts a very wide ledger span (100 000 ledgers tested
 *                    successfully). There is NO ~10 000-ledger span cap.
 *   getEvents        always returns at most 100 events. `limit` is ignored:
 *                    limit=1, 5, 50, 99, 100 and 101 all returned 100 events.
 *   getEvents        returns a `cursor`, but the cursor is NOT honoured.
 *                    `{ cursor }` alone -> "startLedger must be positive".
 *                    `{ cursor, startLedger, endLedger }` -> the cursor is
 *                    ignored and the first page is returned again.
 *   getEvents        startLedger below the current oldestLedger is a hard
 *                    -32600 error, not an empty array.
 *   getEvents        endLedger beyond latestLedger is clamped silently.
 *   getLedger        method not found.
 *
 * Consequence: any window that yields exactly 100 events is TRUNCATED and
 * cannot be completed through this RPC. The walker therefore reports the
 * event count as a lower bound and counts truncated windows.
 */

/** Measured retention window: 120 960 ledgers = 7 days at 5 s per ledger. */
export const RETENTION_LEDGERS = 120960;

/** Observed hard cap on events per getEvents response. */
export const PAGE_CAP = 100;

export const DEFAULT_STEP = 9000;

/** Inclusive ledger windows covering [from, to]. */
export function splitWindows(from, to, step = DEFAULT_STEP) {
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error("from/to must be finite numbers");
  if (to < from) throw new Error("to must be >= from");
  if (!Number.isFinite(step) || step < 1) throw new Error("step must be >= 1");
  const out = [];
  for (let start = from; start <= to; start += step) {
    out.push([start, Math.min(start + step - 1, to)]);
  }
  return out;
}

/** Total ledgers represented by a list of inclusive windows. */
export function coveredLedgers(windows) {
  return windows.reduce((n, [a, b]) => n + (b - a + 1), 0);
}

/** Coverage as a percentage, rounded to one decimal. */
export function coveragePct(windows, from, to) {
  const requested = to - from + 1;
  if (requested <= 0) return 0;
  return Math.round((coveredLedgers(windows) / requested) * 1000) / 10;
}

/** Every window must be fully inside [from, to] and windows must not overlap. */
export function windowsAreSane(windows, from, to) {
  let prevEnd = null;
  for (const [a, b] of windows) {
    if (a > b) return false;
    if (a < from || b > to) return false;
    if (prevEnd !== null && a !== prevEnd + 1) return false;
    prevEnd = b;
  }
  return true;
}

/**
 * Clip a requested range to what the RPC currently serves.
 * `startLedger` below oldest is a hard error, so it must be clipped forward;
 * `endLedger` beyond latest is clamped by the server, but clipping it here
 * keeps the reported range honest.
 */
export function clampRange(from, to, oldest, latest) {
  if (![from, to, oldest, latest].every(Number.isFinite)) {
    throw new Error("clampRange needs four finite numbers");
  }
  const start = Math.max(from, oldest);
  const end = Math.min(to, latest);
  return {
    start,
    end,
    ok: end >= start,
    clippedStart: start !== from,
    clippedEnd: end !== to,
  };
}

/** A window is truncated when it filled the observed per-response cap. */
export function isTruncated(eventCount, cap = PAGE_CAP) {
  return eventCount >= cap;
}
