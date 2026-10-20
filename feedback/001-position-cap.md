# Perp maker checks current inventory but can quote beyond its position cap

Severity: major
Area: app

## Steps to reproduce

1. Follow the pinned installation in the repository README.
2. Run `npm exec -- vitest run packages/perp-core/tests/bounty-maker.test.ts --reporter=verbose`.
3. Inspect the `CAP_REPRO` result. The harness supplies a 90 USDso long position,
   a mark of 100, the default 100 USDso position cap, and default 25 USDso quote size.
   The mock pool ceiling permits the requested size.
4. The real strategy asks `placePerp` to place the full 25 USDso long-side quote.

## Expected

The position cap limits worst-case inventory after an increasing quote fills.
With 90 already held and a cap of 100, the increasing quote should be clamped
to at most 10 USDso (subject to lot/minimum rules), or omitted.

## Actual

The guard checks `inventory >= MAX_POSITION`, which is false for 90 versus 100.
It does not subtract existing exposure from the requested notional. It therefore
submits a 25 USDso increasing quote; a full fill at the unchanged mark would raise
inventory to 115 USDso.

The pool's margin ceiling is a different constraint and does not enforce this
bot-specific position cap.

## Evidence

```json
{"startingInventory":90,"configuredCap":100,"bidNotionalAtMark":25,"possibleInventoryAfterFill":115}
```

[Pinned strategy](https://github.com/somnia-chain/dreamdex-bot-kit/blob/25798660bbe4674a6f83a960b202852896e2fed4/strategies/perp-maker/src/index.ts):
the `wouldExceed` calculation and `sizeOrder` invocation use current inventory
and the unadjusted `wanted` quantity.

The harness asserts the requested order amount, not a live fill. Its placement mock
returns a skipped order. The 115 result is the implied post-fill exposure at the
fixture mark, not an observed account balance. No contract vulnerability is alleged.

## Suggested correction

Clamp the increasing side to remaining signed inventory headroom before lot alignment
and pool sizing. Include resting increasing orders in worst-case exposure. Test long
and short positions, near-cap inventory and quotes larger than the cap.

## Environment

- Upstream commit: `25798660bbe4674a6f83a960b202852896e2fed4`
- Bot-kit package: `@dreamdex-bot-kit/perp-core` 0.1.0
- SDK dependency: `@somnia-chain/markets-sdk` 0.31.0 in the perp-core workspace lockfile
- Network target: Somnia Tokyo/Hideki testnet, chain 50383; offline mocked execution
- Wallet address: none; harness uses a fixed placeholder, with no private key
- Verified: October 20, 2026, Windows and macOS
- Bounty acceptance, severity and duplicate status: organizer decision
