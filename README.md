# Breakout Rider — btc-race-24h-20261123-0511

[![make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/Ibnu3456787/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/Ibnu3456787/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

A bot that trades cbBTC (CBBTC/USDC) on 1-minute on-chain bars with $1,000 of
paper money. Long only, one position at a time, full size.

## Strategy

* **Enter** on a genuine 60-minute breakout: the close above the highest close
  of the previous 60 bars AND at least 0.5% above the lowest close of those
  bars, confirmed on 2 consecutive bars. Buy with all cash.
* **Exit** on a 2% trailing stop from the highest close since entry. Sell all.
* After a stop-out, wait 120 bars before the next entry.

A full-size round trip costs ~35 bps in fees (4 bps), slippage (2 bps) and
pool impact, so the bot trades rarely: it rides real trends, sits in cash
through chop, and the 2% stop caps the damage on a reversal. Every comparison
uses exact bigint arithmetic on the bars' integer prices — no clock, no
randomness, no environment reads, so two runs on the same data are identical.

## Why this shape (dev-window evidence)

Tested ~30 strategies against the frozen 24h dev window with a faithful local
replay of the harness's fill model (validated: the replay reproduces the
official `grade-local` buy-and-hold score of +$32.17 exactly):

* Buy-and-hold: +$32.17 (1 trade) — the window rose +3.64%.
* Every fast crossover / mean-reversion variant (EMA 8/32, SMA trend,
  Donchian 20/10, momentum): **all negative** (-$15 to -$138, 15-86 trades) —
  whipsawed to death in the post-jump chop.
* This bot: **+$29.56, 1 trade, max drawdown 1.98%**, cost-sensitivity (fees
  doubled) still +$28.74.
* Stress checks: first half +$25.35, second half +$0.56, mirrored downtrend
  -$24.05 (3 trades max, drawdown 2.4%), flat market $0.00 / 0 trades.

## Layout

* `main.ts` — the strategy (the entrypoint).
* `vendor/makefun-bars.ts` — the kit's bars-replay/v1 SDK shim, copied
  byte-for-byte (excluded from authorship counts per the rules).

## Grade locally

```
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```

Expected dev result: net PnL ≈ +$29.56 USDC, 1 trade, max drawdown ≈ 1.98%,
0 rejected orders, action logs reproduced across both runs.
