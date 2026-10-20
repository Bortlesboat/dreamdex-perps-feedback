# Perp maker stops retrying skipped quotes while the mark stays unchanged

Severity: normal
Area: app

## Steps to reproduce

1. Follow the pinned installation in the repository README.
2. Run `npm exec -- vitest run packages/perp-core/tests/bounty-maker.test.ts --reporter=verbose`.
3. Inspect the actual-rejection test. The mark is 100 for two iterations; the
   controlled SDK boundary throws `PostOnlyWouldCross`. The real `placePerp`
   helper catches it and returns `{sent:false, filled:0n, noFill:true}`.
4. There are no resting order IDs, but the strategy skips all quote attempts
   during the second cycle.

## Expected

After a skipped quote, the maker should check whether a quote is missing and retry
on a subsequent cycle, even if the mark is unchanged. The helper explicitly says
it will re-quote next cycle.

## Actual

`next` starts with `atMark: mark`; it is assigned to `resting` even when both quote
attempts return no order ID. On the next iteration, `drift` is zero and the strategy
continues before checking whether any quote exists.

The bot can remain idle until mark drift exceeds `PERP_MM_REQUOTE_TRIGGER_BPS`,
although the order book may move independently and a later post-only order could
rest successfully.

## Evidence

```json
{"cycles":2,"quoteAttempts":2,"restingOrders":0,"expectedAttemptsWithRetry":4}
```

[Pinned strategy](https://github.com/somnia-chain/dreamdex-bot-kit/blob/25798660bbe4674a6f83a960b202852896e2fed4/strategies/perp-maker/src/index.ts):
the drift check precedes missing-order detection, and `resting = next` retains
the mark after failed-to-rest quotes.

[Pinned order helper](https://github.com/somnia-chain/dreamdex-bot-kit/blob/25798660bbe4674a6f83a960b202852896e2fed4/packages/perp-core/src/orders.ts)
catches the injected `PostOnlyWouldCross` exception during the reproduction.

This is a deterministic strategy-control-flow reproduction, not evidence of a
currently broken live market. A moving-mark negative control already retries
upstream. A partial-rejection case shows the healthy ask remains live while the
bid is missing.

## Suggested correction

Track each quote's resting state independently from mark drift. Missing quotes
need a retry path; drift alone should not suppress recovery. A deliberate side
disablement at the inventory cap should remain distinct from a failed placement.

The [candidate patch](../repro/candidate-fix.patch) retries the missing leg while
preserving the healthy leg's queue position. Two rejected quotes produce four
attempts over two cycles; a rejected bid plus successful ask produces three,
with the successful ask cancelled only at final shutdown. Healthy quotes and
an intentionally disabled side retain their upstream behavior.

## Environment

- Upstream commit: `25798660bbe4674a6f83a960b202852896e2fed4`
- Bot-kit package: `@dreamdex-bot-kit/perp-core` 0.1.0
- SDK dependency: `@somnia-chain/markets-sdk` 0.31.0 in the perp-core workspace lockfile
- Network target: Somnia Tokyo/Hideki testnet, chain 50383; offline mocked execution
- Wallet address: none; no key, network call or transaction
- Verified: October 20, 2026, Windows and macOS
- Bounty acceptance and duplicate status: organizer decision
