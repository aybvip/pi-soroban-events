# Sources — pi-soroban-events

Every figure in this repository is an observation of a live endpoint, or is
derived from one by a pure function. Nothing here is quoted from documentation.
The "source" is therefore a **command** and the endpoint it talks to.

## Endpoints

| Endpoint | Role | Measured 2026-10-19 |
|---|---|---|
| `https://rpc.testnet.minepi.com` | the Soroban JSON-RPC used for all event measurements | works — protocol `28`, node `28.0.1`, retention window `120960` |
| `https://rpc.mainnet.minepi.com` | attempted; refused by the tool | **HTTP 503**; certificate expired 2023-05-30 |
| `https://api.mainnet.minepi.com` | Horizon REST, not JSON-RPC — not used by this tool | works (see `pi-nft-provenance`) |

The Mainnet Soroban host is recorded because its absence changes what a caller
can do: there is no public Soroban RPC on Mainnet, so event work targets Testnet.

## Measurements and the command that produces them

| Figure | Value | How to re-measure |
|---|---|---|
| `endLedger` is exclusive | `[L, L]` → 0 events, `[L, L+1]` → ledger `L` | a `getEvents` call with both bounds; the tool's own run prints the range it sent |
| Events per response | 100 (`limit` ignored) | request `limit` = 1, 5, 50, 99, 100, 101 and compare |
| Cursor paging | not honoured | send `{ cursor }` alone, then `{ cursor, startLedger, endLedger }` |
| Retention | 120 960 ledgers | `getHealth` → `ledgerRetentionWindow` |
| `startLedger` below retention | `-32600` error | send a `startLedger` older than the retention window |
| Ledger-span cap | none found up to 100 000 | send a 100 000-ledger span and read the response |
| `filters[].type` | `system` or `contract` only | send `type: "transaction"` and read the rejection |
| `getLedger` / `getContractData` | method not found | call them and read the error code |
| Mainnet Soroban RPC | HTTP 503 | request the host and read the status |

## Reproducing the whole set

```bash
git clone https://github.com/aybvip/pi-soroban-events
cd pi-soroban-events
node --test test.mjs                       # 34 offline checks, no network
node events-walk.mjs --from 27249000 --to 27252000 --dry-run   # windows, no network
node events-walk.mjs --from 27249000 --to 27252000             # a live walk
```

The live walk is the only command that touches the network, and it only reads.
The ledger numbers above are inside the measured retention window at the
recorded date; a later run needs a range inside the then-current retention
window, which the tool reports before walking.

## Provenance of this repository's numbers

The measurements were taken on **2026-10-19** against
`https://rpc.testnet.minepi.com` at protocol version **28** (node `28.0.1`).
Protocol version is read from `getNetwork` / `getVersionInfo` at measurement
time, and the tool prints the endpoint it used, so a later reader can tell
whether the recording still applies.

No third-party mirror or blog is used as a source. Where a widely repeated claim
(the "~10 000-ledger cap") is mentioned, it is mentioned to record that it **did
not reproduce**, not as a source.
