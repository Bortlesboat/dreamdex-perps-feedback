# dreamDEX Perps Builder Bounty — feedback

Two offline reproductions against the official `perp-maker` example at commit
`25798660bbe4674a6f83a960b202852896e2fed4`.

| Report | Proposed severity | Observed result |
|---|---|---|
| [Position cap](feedback/001-position-cap.md) | major | A 90 USDso position with a 100 USDso cap still permits a 25 USDso increasing quote. |
| [Skipped quote retry](feedback/002-skipped-quote-retry.md) | normal | After both quotes are skipped, a second unchanged-mark cycle places no replacement quotes. |

The harness imports the actual upstream strategy and retains the real `sizeForNotional`,
`sizeOrder`, `placePerp`, `positionIn` and cancellation helpers. It controls exchange
responses, startup checks and time. `PostOnlyWouldCross` is thrown at the SDK call
boundary and handled by the real helper.
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

Expected: 42 tests pass: 31 upstream tests and 11 reproduction/control cases.
Seven cases assert the current defects; four controls exercise behavior that already works.
Verified on Windows and macOS on October 20, 2026.

## Test a candidate correction

The same harness also expresses the desired contract. Against unmodified upstream,
the following test command fails **7 cases** and passes **4 controls**:

```powershell
$env:EXPECT_MAKER_FIX='1'
npm exec -- vitest run packages/perp-core/tests/bounty-maker.test.ts
```

From the cloned upstream directory, apply the supplied patch and rerun:

```powershell
git apply ../repro/candidate-fix.patch
npm exec -- vitest run packages/perp-core/tests
npm run typecheck -w perp-maker
Remove-Item Env:EXPECT_MAKER_FIX
```

Patched result: **42 tests pass**, including all 11 contract/control cases; strategy
type checking passes. On macOS/Linux prefix test commands with `EXPECT_MAKER_FIX=1`.
The patch preserves a successful quote while retrying its missing counterpart. It
clamps quantity to signed position headroom before real lot alignment and pool sizing.
It does not claim to enforce a continuous risk limit through mark changes, external
orders, fill/cancel races or cancellations that fail. Those require live order-state
reconciliation beyond these two reports.

On macOS or Linux, replace `Copy-Item` with `cp` and `Set-Location upstream`
with `cd upstream`. The remaining commands are identical.

Measured comparison:

```text
                                      Upstream   Candidate
90 / 100 cap: increasing quote              25          10
-90 / 100 cap: increasing quote             25          10
flat / 100 cap: requested 250              250         100
same mark, both rejected: attempts           2           4
same mark, only bid rejected: attempts       2           3
smaller pool ceiling: increasing quote       5           5
healthy quotes, same mark: attempts          2           2
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
