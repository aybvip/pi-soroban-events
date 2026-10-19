# Pi Soroban Events Explorer

A **read-only, zero-dependency** walker over Soroban events on Pi Network.

> **Plainly:** Pi's `getEvents` caps a single query near **10 000 ledgers** and
> returns an **empty result, not an error**, when the range is too wide. A bare
> "no events found" can therefore be indistinguishable from "the query silently
> covered a truncated window". This tool walks the range in **explicit windows**
> and reports the **measured coverage**, so a reader never has to guess.

## Why it exists

Most event consumers issue one `getEvents` call, see `[]`, and conclude
"nothing happened". That conclusion is unsafe: an empty array can mean either
genuinely no events **or** a silently truncated window. This tool removes the
ambiguity by walking in windows that each stay under the cap and stating what
fraction of the requested ledger span was actually covered.

## Quick start

```bash
node events-walk.mjs --from 1000 --to 15000
node events-walk.mjs --from 1000 --to 15000 --network mainnet --step 9000
```

No install. No API keys. No writes. No database.

## Output

A per-window table plus a coverage summary:

```
windows: 2

  [1000 .. 9999]    span=9000  events=12
  [10000 .. 15000]  span=5001  events=0

# Coverage
ledgers_requested: 14001
ledgers_covered:   14001  (100.0%)
windows_walked:    2
events_found:      12
```

## Scope

| In scope | Out of scope |
|---|---|
| Walking `getEvents` in explicit windows | Indexing or storing events |
| Reporting measured coverage completeness | Rendering a full explorer UI |
| Detecting the silent-truncation footgun | Writing to the chain |

## What this tool does **not** claim

| Not claimed | Why |
|---|---|
| That the 10 000-ledger cap is a protocol constant | It is an **observed** RPC behaviour and may change. The tool measures coverage rather than assuming a fixed cap. |
| That an empty window proves no events exist | It reports what the RPC returned for that window, with the coverage figure beside it. |
| That event contents are interpreted correctly | It counts and reports; interpretation belongs to the caller. |

## See also

- `pi-nft-provenance` — derive who created a token and when, from a tx hash
- `pi-contract-upgrade-trail` — track `wasmHash` changes across deployments
- `pi-nft-fee-check` — reconcile declared fees against on-chain events
