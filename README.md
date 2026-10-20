# Pi Soroban Events Explorer

A **read-only, zero-dependency** walker over Soroban events on Pi Network.

> **Plainly:** the usual story about `getEvents` — "it caps at ~10 000 ledgers and
> returns an empty array" — **is not what the RPC does today**. Measured on
> 2026-10-19 against `https://rpc.testnet.minepi.com` (protocol 28), a
> **100 000-ledger span succeeded**. The real footguns are different, and this
> tool measures all three:
>
> 1. **`endLedger` is exclusive.** `[L, L]` returns **zero** events; `[L, L+1]`
>    returns the events of ledger `L`. A single-ledger query silently finds
>    nothing.
> 2. **At most 100 events per response, and `limit` is ignored.** `limit=1` and
>    `limit=101` both returned 100 events.
> 3. **The returned `cursor` is not honoured.** `{ cursor }` alone fails with
>    `startLedger must be positive`; `{ cursor, startLedger, endLedger }` ignores
>    the cursor and repeats the first page. A window with 100 events therefore
>    **cannot be completed**.

## Why it exists

An empty result is ambiguous. It can mean "no events happened", "you queried the
wrong ledger boundary", or "the page is full and there is no way to continue".
This tool removes the ambiguity by walking explicit windows and reporting, per
window, whether it was **truncated** — and by treating the event count as a
**lower bound** whenever truncation occurred.

## Quick start

```bash
# A recent range. Retention is 120 960 ledgers (7 days), so very old ranges
# are rejected by the RPC before any event is read.
node events-walk.mjs --from 27249000 --to 27252000

# See the windows without touching the network
node events-walk.mjs --from 27249000 --to 27252000 --dry-run

# Target another endpoint explicitly (e.g. if a Mainnet RPC appears)
node events-walk.mjs --from 1000 --to 2000 --rpc https://example.invalid
```

No install. No API keys. No writes. No database.

## Output

Real output from a 2 901-ledger walk on 2026-10-19:

```
# Pi Soroban Events — coverage walk
network: testnet
rpc:     https://rpc.testnet.minepi.com
range:   27249937 .. 27252837  (span 2901 ledgers)
step:    1000

retention: oldest=27131978 latest=27252937 span=120960
  [27249937 .. 27250936]  span=1000  events=100  TRUNCATED (cap=100; cursor not honoured, cannot continue)
  [27250937 .. 27251936]  span=1000  events=100  TRUNCATED (cap=100; cursor not honoured, cannot continue)
  [27251937 .. 27252837]  span=901  events=100  TRUNCATED (cap=100; cursor not honoured, cannot continue)

# Coverage
ledgers_requested: 2901
ledgers_covered:   2901  (100% of the request)
windows_walked:    3
windows_truncated: 3  (>= 100 events in one response)
windows_errored:   0
events_found:      300  (LOWER BOUND — truncated windows)
```

The ledger coverage is complete; the **event** count is a lower bound. Saying so
is the point.

## Measured constraints

All measured on 2026-10-19 against `rpc.testnet.minepi.com`, protocol 28.

| Constraint | Measured value | Consequence |
|---|---|---|
| Ledger-span cap | **none found** | A 100 000-ledger span succeeded. The old "~10 000" claim did not reproduce. |
| Events per response | **100** | `limit` is ignored: 1/5/50/99/100/101 all returned 100. |
| Cursor paging | **not honoured** | Cursor-only fails; cursor + range repeats page 1. |
| `endLedger` | **exclusive** | `[L, L]` = 0 events, `[L, L+1]` = events of `L`. |
| `filters[].type` | `system` or `contract` only | Filtering by transaction hash is rejected. |
| `startLedger` below retention | **-32600 error** | Not an empty array. |
| Retention | **120 960 ledgers** | 7 days at 5 s/ledger; `getHealth` reports `ledgerRetentionWindow: 120960`. |
| `getLedger` | **method not found** | Use `getLatestLedger` / `getTransactions` / `getLedgers`. |
| `getContractData` | **method not found** | `getLedgerEntries` exists but needs a base64 ledger key. |
| Mainnet Soroban RPC | **HTTP 503** | `rpc.mainnet.minepi.com` serves a certificate that expired 2023-05-30. |

## Scope

| In scope | Out of scope |
|---|---|
| Walking `getEvents` in explicit windows | Indexing or storing events |
| Reporting per-window truncation and coverage | Rendering a full explorer UI |
| Detecting the exclusive-`endLedger` boundary | Writing to the chain |

## What this tool does **not** claim

| Not claimed | Why |
|---|---|
| That "no events found" means no events exist | A window that returns 0 may still be mis-bounded. The tool always sends `end + 1` and prints the exact range it queried. |
| That `events_found` is a total | When any window returns 100 events, the cursor cannot continue, so the figure is a lower bound and is labelled as such. |
| That the 100-event cap is a protocol constant | It is an **observed** RPC behaviour and may change. The tool re-measures it on every run rather than hard-coding trust in it. |
| That event contents are interpreted correctly | It counts and reports; interpretation belongs to the caller. |

## Tests

```bash
node --test test.mjs
```

34 checks. The window arithmetic and retention math are pure functions in
`windows.mjs`; the CLI is exercised in `--dry-run` mode, so **no network is
needed**:

- ranges shorter than, equal to, and longer than one step
- the final window is always clipped to `--to`
- windows tile the range with no gaps and no overlaps
- `coveredLedgers` equals the requested span and coverage reaches 100%
- `to < from`, `step < 1`, and non-finite inputs are rejected
- `clampRange` clips a start below retention and an end above latest, and
  reports `ok: false` when the range is entirely outside
- `isTruncated` fires at exactly 100 and not at 99
- the retention constant is checked against `120 960 × 5 s = 7 days`
- `--network mainnet` refuses with the measured 503 reason and exits `2`
- `--rpc` overrides the endpoint without a mainnet refusal
- `--dry-run` reaches 100% coverage for every range shape


## Documentation

| Document | What it covers |
|---|---|
| [`docs/INDEX.md`](docs/INDEX.md) | everything, in reading order, with the claim status of each figure |
| [`docs/BOUNDARIES.md`](docs/BOUNDARIES.md) | every non-claim, in full |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | the design choices and the measurement behind each |
| [`docs/SOURCES.md`](docs/SOURCES.md) | the endpoint, the date, and how to re-measure |
| [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | how to reproduce the tests and the live run |
| [`llms.txt`](llms.txt) | a compact summary for machine readers |

## See also

- `pi-nft-provenance` — read a transaction, its ledger, operations and effects
- `pi-contract-upgrade-trail` — track `wasmHash` changes across deployments
- `pi-nft-fee-check` — reconcile declared fees against on-chain events
