# Design decisions — pi-soroban-events

Each decision below follows from a measurement, not from preference. Where a
measurement changed, the decision would change with it.

## D1 — Always send `end + 1`

**Measurement:** `getEvents` with `endLedger` equal to `startLedger` returns zero
events; `[L, L+1]` returns the events of ledger `L` ([`SOURCES.md`](SOURCES.md)).

**Decision:** the tool never sends the caller's `--to` verbatim. It sends
`end + 1`, so a single-ledger range still finds that ledger's events. The exact
range queried is printed, so the off-by-one is visible rather than hidden.

## D2 — Report truncation instead of pretending completeness

**Measurement:** every response is capped at 100 events and `limit` is ignored;
the returned `cursor` cannot be used to continue.

**Decision:** when a window returns 100 events, the count for that window is
recorded as **≥ 100** and the total is labelled a **lower bound**. The alternative
— printing one number per window and a total — would silently under-report.

## D3 — Walk explicit windows rather than one large range

**Measurement:** the RPC has a 100-event page cap and an unhonoured cursor. A
single large query therefore stops at the first 100 events with no way to
continue.

**Decision:** the range is split into windows of `--step` ledgers (default
**9 000**, from `DEFAULT_STEP` in `windows.mjs`). Each window is answered
independently, so a full window does not hide the windows after it. 9 000 is
chosen so that a window is unlikely to exceed 100 events while keeping the number
of requests low; it is a caller-visible default, not a constant of the protocol.

## D4 — Treat retention as a boundary, not a filter

**Measurement:** a `startLedger` below the retention window is rejected with
`-32600` "startLedger must be within the ledger range", not answered with an
empty array. Retention is 120 960 ledgers, reported by `getHealth`
(`ledgerRetentionWindow`).

**Decision:** `clampRange` clips a requested range to the retention window and
reports `ok: false` when the range lies entirely outside it, so the caller is told
why a range produced nothing instead of being shown an empty result.

## D5 — Pure arithmetic in a separate module

**Decision:** the window tiling, coverage and retention math live in
`windows.mjs` as pure functions (`splitWindows`, `coveredLedgers`,
`coveragePct`, `windowsAreSane`, `clampRange`, `isTruncated`). `events-walk.mjs`
is the CLI wrapper. This is what makes the 34 checks runnable with no network:
the logic is testable without spawning a process or opening a socket.

## D6 — Refuse Mainnet by default, allow an override

**Measurement:** `rpc.mainnet.minepi.com` answered HTTP 503 and serves a
certificate that expired 2023-05-30.

**Decision:** `--network mainnet` refuses with that measured reason and exits `2`,
rather than failing with a transport error. `--rpc <url>` overrides the endpoint
without the refusal, so the tool works against any endpoint, including one that
appears later.

## D7 — No writing of any kind

**Decision:** the tool never builds, signs or submits a transaction, never writes
a file, and needs no API key. Its whole surface is `getHealth` and `getEvents`
reads. This keeps the tool safe to run against any endpoint at any time.
