# Documentation index — pi-soroban-events

A read-only, zero-dependency walker over Soroban events on Pi Network that
reports per-window truncation and treats a truncated count as a lower bound.

| Document | What it covers |
|---|---|
| [`BOUNDARIES.md`](BOUNDARIES.md) | every claim this tool does **not** make, and why |
| [`DECISIONS.md`](DECISIONS.md) | the design choices that follow from the measurements |
| [`SOURCES.md`](SOURCES.md) | where the numbers come from and how to re-measure them |
| [`VERIFICATION.md`](VERIFICATION.md) | how to reproduce the tests and the walk |
| [`../README.md`](../README.md) | the full description and quick start |
| [`../llms.txt`](../llms.txt) | a compact summary for machine readers |

## The one-line answer

> An empty `getEvents` result is ambiguous, and this tool removes the ambiguity by
> walking explicit windows, always sending `end + 1`, and labelling a truncated
> event count as a **lower bound**.

## Claim status at a glance

| Statement | Status |
|---|---|
| `endLedger` is exclusive | **measured** (2026-10-19, protocol 28) |
| At most 100 events per response; `limit` ignored | **measured** |
| The returned `cursor` is not honoured | **measured** |
| A 100 000-ledger span succeeds | **measured** (the old "~10 000" claim did not reproduce) |
| Retention is 120 960 ledgers | **measured** (`getHealth.ledgerRetentionWindow`) |
| Mainnet Soroban RPC is unreachable | **measured** (HTTP 503) |
| Ledger coverage is exact | **verifiable** (`node --test test.mjs`) |
| The event count is a total | **not claimed** when any window is truncated |
