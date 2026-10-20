# dreamDEX Perps Builder Bounty — feedback

Two offline reproductions against the official `perp-maker` example at commit
`25798660bbe4674a6f83a960b202852896e2fed4`.

| Report | Proposed severity | Observed result |
|---|---|---|
| [Position cap](feedback/001-position-cap.md) | major | A 90 USDso position with a 100 USDso cap still permits a 25 USDso increasing quote. |
| [Skipped quote retry](feedback/002-skipped-quote-retry.md) | normal | After both quotes are skipped, a second unchanged-mark cycle places no replacement quotes. |

The harness imports the actual upstream strategy and mocks its exchange boundary.
It does not reproduce network execution or assert that any user lost funds.
No wallet, credentials, RPC calls or transactions are used.

## Reproduce

Prerequisites: Git and Node 20+ with npm. Commands below are PowerShell.

```powershell
git clone https://github.com/somnia-chain/dreamdex-bot-kit.git upstream
git -C upstream checkout 25798660bbe4674a6f83a960b202852896e2fed4
Copy-Item repro/bounty-maker.test.ts upstream/packages/perp-core/tests/
Set-Location upstream
npm ci --ignore-scripts --no-audit --no-fund
npm exec -- vitest run packages/perp-core/tests --reporter=verbose
```

Expected: 33 tests pass, including two tests asserting the current defective behavior.
These tests document the defects; a corrected strategy should change the two repro assertions.
Verified on Windows and macOS on October 20, 2026.

On macOS or Linux, replace `Copy-Item` with `cp` and `Set-Location upstream`
with `cd upstream`. The remaining commands are identical.

Recorded output:

```text
CAP_REPRO {"startingInventory":90,"configuredCap":100,"bidNotionalAtMark":25,"possibleInventoryAfterFill":115}
RETRY_REPRO {"cycles":2,"quoteAttempts":2,"restingOrders":0,"expectedAttemptsWithRetry":4}
Test Files  3 passed (3)
     Tests  33 passed (33)
```

## Submission status

Prepared for the [Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail).
Not yet submitted or accepted. Email whitelist is pending.
The organizer determines scope, severity, duplication and any payment.

Open and closed upstream issue/PR titles were checked October 20. No matching perps
position-cap or skipped-quote report was found there. Private bounty submissions cannot
be checked. These are strategy-example findings in the official bounty resources;
the organizer must confirm whether they qualify under its SDK/app scope.

## License

Original reproduction harness and report text: MIT, 2026.
The upstream strategy belongs to DreamDEX S.A. and remains under its MIT license;
it is downloaded separately and is not copied into this repository.
