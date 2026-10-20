# What this tool does **not** claim

This repository reports measurements. A measurement can be precise and still not
support the conclusion a reader wants to draw from it. The list below is the
boundary: every statement that is deliberately **not** made, and the reason.

| Not claimed | Why |
|---|---|
| That "no events found" means no events exist | A window that returns 0 may be mis-bounded. The tool always sends `end + 1` and prints the exact range it queried, so the reader can judge. |
| That `events_found` is a total | When any window returns 100 events, the cursor cannot continue, so the figure is a **lower bound** and is labelled as such. |
| That the 100-event cap is a protocol constant | It is an **observed** RPC behaviour and may change. The tool re-measures it on every run rather than hard-coding trust in it. |
| That event contents are interpreted correctly | The tool counts and reports; interpretation belongs to the caller. |
| That the ledger span cap does not exist | Only that it was not found up to 100 000 ledgers on 2026-10-19. A larger span was not attempted. |
| That Mainnet will stay unreachable | Only that the Mainnet Soroban host answered HTTP 503 on 2026-10-19. |
| That this is the first such tool | The prior-art position is **"no prior work found"**, not "we are first". |
| That Pi Network has adopted, reviewed or endorsed this | Adoption is **not-claimed**. This is a measurement offered to anyone who wants it. |

## The shape of the claim

Two kinds of statement appear in this repository, and they are kept apart on
purpose:

- **Measured** — produced by a command in this repository against a named
  endpoint on a named date, and re-checkable.
- **Asserted** — nothing. There is no category of statement here that is simply
  believed.

Where a figure depends on the network, it is scoped to the endpoint, the protocol
version and the date. It is not extended beyond them.
