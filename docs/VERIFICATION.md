# Verification — pi-soroban-events

Two things are checked here, and they are separate: the **arithmetic** (offline,
deterministic) and the **network behaviour** (live, and therefore dated).

## Offline: the test suite

```bash
git clone https://github.com/aybvip/pi-soroban-events
cd pi-soroban-events
node --test test.mjs
```

Expected result: **34 pass, 0 fail**, with **no network access**. The suite is
runnable with the network unplugged, because it exercises `windows.mjs` directly
and runs the CLI only in `--dry-run` mode.

What the 34 checks cover:

- ranges shorter than, equal to, and longer than one step
- the final window is always clipped to `--to`
- windows tile the range with no gaps and no overlaps
- `coveredLedgers` equals the requested span and coverage reaches 100 %
- `to < from`, `step < 1`, and non-finite inputs are rejected
- `clampRange` clips a start below retention and an end above latest, and reports
  `ok: false` when the range is entirely outside
- `isTruncated` fires at exactly 100 and not at 99
- the retention constant is checked against `120 960 × 5 s = 7 days`
- `--network mainnet` refuses with the measured 503 reason and exits `2`
- `--rpc` overrides the endpoint without a Mainnet refusal
- `--dry-run` reaches 100 % coverage for every range shape

## Live: the walk

```bash
node events-walk.mjs --from 27249000 --to 27252000
```

This is the only command that opens a socket. It reads `getHealth` and
`getEvents` and writes nothing. The output names the endpoint, the range, the
step and the retention window, then one line per window, then a coverage block.
A window that returned 100 events is marked `TRUNCATED` and the total is labelled
a lower bound.

## How to check the measurement without trusting this repository

The point of the tool is that its output is re-derivable, not believed:

1. Run the offline suite. If the arithmetic is wrong, a test fails — with no
   network involved, so the failure cannot be blamed on the endpoint.
2. Run a live walk over any range inside the current retention window. The tool
   prints the exact requests it made, so the same calls can be repeated by hand
   with `curl` and compared against the printed result.
3. Change the endpoint with `--rpc <url>` and confirm the tool makes no
   assumption that only `rpc.testnet.minepi.com` works.

## What a passing run does and does not show

- A passing offline suite shows the **arithmetic** is as specified: windows tile
  the range, coverage is exact, the boundary cases behave.
- A successful live walk shows the **endpoint answered** for that range at that
  time, and nothing about other ranges, other versions or other endpoints.
- Neither shows that the event count is complete: truncation is reported, not
  resolved, because the RPC offers no way to continue past a full page.

## Reproducibility note

No digest or signature is attached to these results, and none is claimed. A
digest would prove integrity, not truth, and a signature would require naming an
authority this project does not have. What is offered instead is a command whose
outcome anyone can recompute.
