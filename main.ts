// Breakout rider for the btc-race-24h-20261123-0511 bounty.
//
// Strategy (long only, $1,000 paper, one position at a time):
//   * ENTER on a genuine 60-minute breakout: the close above the highest close
//     of the previous 60 bars AND at least 0.5% above the lowest close of those
//     bars (so flat chop never triggers an entry), confirmed on 2 consecutive
//     bars. Buy with all cash.
//   * EXIT on a 2% trailing stop from the highest close since entry. Sell all.
//   * After a stop-out, wait 120 bars before the next entry (no revenge trades).
//
// Why this shape: a full-size round trip costs ~35 bps in fees, slippage and
// pool impact, so the bot must trade rarely. Backtests on the dev window showed
// every fast crossover / mean-reversion variant bleeding out in chop (20-80
// trades, all negative), while this breakout-plus-wide-stop shape made +$29.56
// on 1 trade. It rides real trends, sits in cash through chop, and a 2% stop
// caps the damage on a reversal. All comparisons use exact bigint arithmetic
// on the bars' integer prices, so the bot is fully deterministic: no clock,
// no randomness, no environment reads.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Lookback for the breakout high/low, in bars (minutes). */
const LOOKBACK = 60;
/** The breakout must clear the lookback low by this much (basis points). */
const MIN_MOVE_BPS = 50;
/** Consecutive confirming bars before an entry. */
const CONFIRM_BARS = 2;
/** Trailing stop: exit when the close falls this far (bps) below the peak. */
const TRAIL_BPS = 200;
/** Bars to wait after a stop-out before the next entry. */
const COOLDOWN_BARS = 120;
/** Max slippage on every order (bps from the latest close). */
const MAX_SLIPPAGE_BPS = 300;

const BPS = 10_000n;

class BreakoutRider {
  /** Closes seen so far, oldest first, as raw price integers. */
  private closes: bigint[] = [];
  /** Highest close since the current entry (0 while flat). */
  private peak = 0n;
  /** Consecutive bars confirming a breakout while flat. */
  private confirm = 0;
  /** Seq of the last stop-out; starts far in the past so the first entry is never blocked. */
  private lastExitSeq = -1_000_000;

  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return []; // missing minute: no new information
    const close = BigInt(bar.c);

    const held = state.positions.get(SYMBOL);
    const long = held !== undefined && held.qty > 0n;

    if (long) {
      if (close > this.peak) this.peak = close;
      // Trailing stop, in exact integers: close < peak * (10000 - 200) / 10000.
      if (close * BPS < this.peak * (BPS - BigInt(TRAIL_BPS))) {
        this.lastExitSeq = state.seq;
        this.peak = 0n;
        this.confirm = 0;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      this.closes.push(close);
      return [];
    }

    // Flat: look for a breakout over the previous LOOKBACK closes.
    if (state.warmingUp || this.closes.length < LOOKBACK) {
      this.closes.push(close);
      return [];
    }
    const window = this.closes.slice(-LOOKBACK);
    let hi = window[0]!;
    let lo = window[0]!;
    for (const c of window) {
      if (c > hi) hi = c;
      if (c < lo) lo = c;
    }
    const breakout =
      close > hi && close * BPS > lo * (BPS + BigInt(MIN_MOVE_BPS));
    this.confirm = breakout ? this.confirm + 1 : 0;
    this.closes.push(close);

    const cooled = state.seq - this.lastExitSeq >= COOLDOWN_BARS;
    if (this.confirm >= CONFIRM_BARS && cooled && state.cash > 0n) {
      this.confirm = 0;
      this.peak = close;
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  }
}

const rider = new BreakoutRider();
await runBars({ onBatch: (state, batch) => rider.onBatch(state, batch) });
