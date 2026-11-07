import { performance } from 'node:perf_hooks';
import { Dictionary, type Word } from './dictionary.js';
import { BAG, VALUES, rackString, subtract, tileCount, type Rack } from './letters.js';
import { Planner, type Plan } from './planner.js';
import { predictOpponentBid, type OpponentProfile } from './opponents.js';
export const POLICY_VERSION = 'fit-v8';
export const BASE_REVISION = 'fit-v8';
const COMMON = 'SRNTLEDC', RARE = 'JQXZ';
const LIQUIDATION = 16, BUILD_RACK = 10, BIG_WORD = 25, RICH_WORD = 30, TARGET_MS = 120;
export interface Policy {
  rewardWeight: number; investmentBase: number; investmentFace: number;
  holdMinLength: number; holdRackSize: number; cashoutBalance: number; opponentWeight: number;
  endgameBudget: number; balanceSmoothing: number;
  sustainability: number; reserveFraction: number;
}
export const DEFAULT_POLICY: Policy = { rewardWeight: 1.55, investmentBase: 6, investmentFace: 3,
  holdMinLength: 7, holdRackSize: 12, cashoutBalance: 18, opponentWeight: 0, endgameBudget: 1, balanceSmoothing: 1,
  sustainability: 1, reserveFraction: 0.55 };
export function validatePolicy(value: Partial<Policy>): Policy {
  const limits: Record<keyof Policy, [number, number]> = { rewardWeight: [1, 2.5], investmentBase: [2, 12], investmentFace: [1, 5],
    holdMinLength: [4, 7], holdRackSize: [8, 15], cashoutBalance: [10, 40], opponentWeight: [0, 0.8], endgameBudget: [0, 1], balanceSmoothing: [0, 1],
    sustainability: [0, 1], reserveFraction: [0.2, 0.8] };
  const policy = { ...DEFAULT_POLICY, ...value };
  for (const key of Object.keys(limits) as (keyof Policy)[]) {
    const [low, high] = limits[key];
    if (!Number.isFinite(policy[key]) || policy[key] < low || policy[key] > high) throw new Error(`Invalid policy parameter ${key}`);
  }
  if (!Number.isInteger(policy.holdMinLength) || !Number.isInteger(policy.holdRackSize)) throw new Error('Hold thresholds must be integers');
  return policy;
}

export interface GameContext {
  rack: Rack;
  balance: number;
  remaining: number; // tiles still in the bag; the open auction is already drawn
  players: number;
  auctionType: 'Vickrey' | 'FirstPrice';
  frequencies?: number[];
  opponents?: { botId: number; balance: number; rackSize: number }[];
  round?: number;
  totalAuctions?: number;
  activePlayers?: number;
}
export interface BidDecision { amount: number; value: number; reason: string; cashGain?: number }
export interface WordDecision { word: string | null; reason: string; planScore: number }

export class Market {
  private prices = new Map<string, number[]>();
  private seen = new Set<string>();
  observe(letter: string, paid: number, auction?: string): void {
    if (auction && this.seen.has(auction)) return;
    if (auction) { this.seen.add(auction); if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value!); }
    const values = this.prices.get(letter) ?? [];
    values.push(paid);
    if (values.length > 120) values.shift();
    this.prices.set(letter, values);
  }
  snapshot() { return { prices: Object.fromEntries(this.prices), seen: [...this.seen] }; }
  restore(value: { prices?: Record<string, number[]>; seen?: string[] }) {
    for (const [letter, values] of Object.entries(value.prices ?? {})) {
      if (/^[A-Z]$/.test(letter) && Array.isArray(values)) this.prices.set(letter, values.filter(n => Number.isFinite(n) && n >= 0).slice(-120));
    }
    this.seen = new Set((value.seen ?? []).filter(s => typeof s === 'string').slice(-2000));
  }
  price(slot: number): number {
    const sample = this.prices.get(String.fromCharCode(65 + slot)) ?? [];
    const prior = 'AEIOU'.includes(String.fromCharCode(65 + slot)) ? 4 : Math.max(3, VALUES[slot]);
    // Smoothed median, robust to one expensive auction.
    const sorted = [...sample].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : prior;
    const weight = Math.min(sorted.length / 12, 0.85);
    return prior * (1 - weight) + median * weight;
  }
}

export class Strategy {
  readonly planner: Planner;
  readonly market = new Market();
  policy: Policy;
  private profiles = new Map<number, OpponentProfile>();
  constructor(readonly dictionary: Dictionary, policy: Partial<Policy> = {}) { this.planner = new Planner(dictionary, 200, true); this.policy = validatePolicy(policy); }
  setPolicy(policy: Partial<Policy>) { this.policy = validatePolicy(policy); }
  setProfiles(profiles: OpponentProfile[]) { this.profiles = new Map(profiles.map(p => [p.botId, p])); }

  private completionProbability(missing: number[], ctx: GameContext): number {
    const frequencies = ctx.frequencies ?? BAG.map(n => n / 98);
    const counts = new Map<number, number>();
    for (const slot of missing) counts.set(slot, (counts.get(slot) ?? 0) + 1);
    let probability = 1;
    // We can target a letter selectively, but cannot assume we win every copy.
    const horizon = Math.min(ctx.remaining, 22);
    const winFraction = Math.max(0.28, Math.min(0.8, 2.4 / Math.max(2, ctx.activePlayers ?? ctx.players)));
    for (const [slot, count] of counts) {
      const lambda = horizon * Math.max(0, frequencies[slot] ?? 0) * winFraction;
      const p = count === 1 ? 1 - Math.exp(-lambda) : 1 - Math.exp(-lambda) * (1 + lambda);
      probability *= Math.max(0, p);
    }
    return probability;
  }

  private potential(ctx: GameContext, cash: Plan): { value: number; target?: Word } {
    if (ctx.remaining <= 1 || tileCount(ctx.rack) < 2) return { value: cash.score };
    const missingLimit = ctx.remaining > 10 && tileCount(ctx.rack) >= 4 ? 2 : 1;
    const options = this.dictionary.candidates(ctx.rack, missingLimit)
      .filter(c => c.missing.length && c.word.text.length >= 4)
      .map(c => {
        const probability = this.completionProbability(c.missing, ctx);
        const futureCost = c.missing.reduce((n, slot) => n + this.market.price(slot) * 0.65, 0);
        // A cheap upper bound lets us inspect only promising completions deeply.
        return { ...c, probability, futureCost, upper: probability * (c.word.score - futureCost) };
      })
      .filter(c => c.probability > 0.02)
      .sort((a, b) => b.upper - a.upper)
      .slice(0, 18);
    let value = cash.score;
    let target: Word | undefined;
    for (const option of options) {
      const owned = option.word.counts.slice();
      for (const slot of option.missing) owned[slot]--;
      const leftover = this.planner.plan(subtract(ctx.rack, owned));
      const upside = option.word.score + leftover.score - cash.score - option.futureCost;
      const candidate = cash.score + Math.max(0, upside) * option.probability;
      if (candidate > value) { value = candidate; target = option.word; }
    }
    return { value, target };
  }

  // Expected reward of the best 7+ letter word within two missing tiles.
  // ponytail: best single target only; a mixture over targets is the upgrade if this proves useful.
  targetEV(rack: Rack, ctx: GameContext): { ev: number; target?: Word } {
    let ev = 0, target: Word | undefined;
    for (const c of this.dictionary.candidates(rack, 2)) {
      if (c.word.text.length < 7) continue;
      const p = c.missing.length ? this.completionProbability(c.missing, ctx) : 1;
      if (p < 0.02) continue;
      const cost = c.missing.reduce((n, slot) => n + this.market.price(slot) * 0.65, 0);
      const v = p * (c.word.score - cost);
      if (v > ev) { ev = v; target = c.word; }
    }
    return { ev, target };
  }

  // Points one coin is worth now. Money has no value at the end.
  // ponytail: step schedule from the research report; fit an alpha(money, time) grid offline later.
  private alpha(remaining: number): number {
    return remaining >= 34 ? 1.3 : remaining >= 17 ? 1 : remaining >= 5 ? 0.5 : 0.1;
  }

  // Builder price ceiling from medians of the bid to beat at our tables, shifted
  // by about 1.7 per active bidder away from 4.5.
  ceiling(letter: string, ctx: GameContext): number {
    if (RARE.includes(letter)) return 0;
    // Heavy letters track their market price (winning bids ~17 for B/C/M/P, ~20 for F/H/V/W/Y, ~24 for K);
    // a low flat ceiling meant we never won them: only 7% of our tiles were worth 4+ points vs 19% for winners.
    const points = VALUES[letter.charCodeAt(0) - 65];
    const base = (COMMON.includes(letter) ? 13.5 : 12) + 2 * Math.max(0, points - 1);
    // Rival bids climb late (about 19 in the last 16 auctions); a flat ceiling stopped us buying after auction ~35.
    // ponytail: linear +3..+5 ramp, fit properly once more live games exist.
    const late = ctx.remaining >= 34 ? 0 : 3 + 2 * (1 - ctx.remaining / 34);
    return Math.max(4, base + late + 1.7 * ((ctx.activePlayers ?? ctx.players) - 4.5));
  }

  bid(letter: string, ctx: GameContext): BidDecision {
    if (ctx.balance < 1) return { amount: 0, value: 0, reason: 'no funds' };
    // The server resolves the last auction and ends the match atomically.
    if (ctx.remaining === 0) return { amount: 0, value: 0, reason: 'final tile cannot be played' };
    const slot = letter.charCodeAt(0) - 65;
    const after = ctx.rack.slice(); after[slot]++;
    const beforePlan = this.planner.plan(ctx.rack);
    const afterPlan = this.planner.plan(after);
    const cashGain = afterPlan.score - beforePlan.score;
    const alpha = this.alpha(ctx.remaining);
    const tiles = tileCount(ctx.rack);
    const big = (rack: Rack) => this.dictionary.playable(rack).some(w => w.text.length >= 7 || w.score >= BIG_WORD);
    let value = 0, tier = 'filler', target: string | undefined, dEV = 0;
    if (ctx.remaining <= LIQUIDATION) {
      // Only tiles that pay before the end are worth money now.
      if (cashGain > 0) { value = ctx.remaining <= 4 ? ctx.balance : cashGain / alpha; tier = 'endgame'; }
      // Spend-down: leftover cash is worthless, so a small rack buys common letters for short words.
      else if (ctx.remaining >= 3 && tiles < 8 && COMMON.includes(letter)) { value = Math.min(8, Math.max(0, ctx.balance - 5)); tier = 'spend-down'; }
    } else if (cashGain > 0 && !big(ctx.rack) && big(after)) {
      // Completer: b* = R + (R - V_wait) / alpha.
      const wait = Math.max(0, this.potential(ctx, beforePlan).value - beforePlan.score);
      value = cashGain + Math.max(0, cashGain - wait) / alpha; tier = 'completer';
    } else if (tiles < BUILD_RACK) {
      // Builder: volume wins (rack size drives P(7-letter word)), so bid up to the
      // letter's ceiling, scaled by fit with the rack.
      const have = ctx.rack[slot];
      const vowels = [...'AEIOU'].reduce((n, c) => n + ctx.rack[c.charCodeAt(0) - 65], 0);
      const ratio = tiles ? vowels / tiles : 0.4;
      const vowel = 'AEIOU'.includes(letter);
      const balance = tiles < 3 ? 1 : vowel ? (ratio >= 0.5 ? 0.5 : 1) : (ratio < 0.2 ? 0.6 : 1);
      const duplicate = have === 0 ? 1 : have === 1 ? 0.6 : 0.2;
      const quFix = letter === 'U' && ctx.rack[16] ? 1.5 : 1;
      const base = this.ceiling(letter, ctx) * balance * duplicate * quFix;
      value = base; tier = 'builder';
      // Value the tile by how much it raises the best 7+ target; time-boxed, else letter ceilings alone.
      const t0 = performance.now();
      const now = this.targetEV(ctx.rack, ctx);
      if (performance.now() - t0 < TARGET_MS / 2) {
        const next = this.targetEV(after, ctx);
        if (performance.now() - t0 < TARGET_MS) {
          const gain = next.ev - now.ev;
          value = base + Math.min(10, 0.4 * Math.max(0, gain) / alpha); tier = 'builder-target';
          // J/Q/X/Z are 8-10 points: bid only when a real target uses them.
          if (RARE.includes(letter) && gain >= 8) value = Math.min(28, 0.6 * gain / alpha);
          target = next.target?.text; dEV = gain;
        }
      }
    } else if (COMMON.includes(letter) && (ctx.activePlayers ?? ctx.players) <= 3) {
      value = 7; tier = 'filler';
    }
    if (ctx.auctionType === 'FirstPrice') {
      value = Math.min(value * 0.82, this.market.price(slot) + Math.max(1, value * 0.25));
    }
    const amount = Math.floor(Math.min(ctx.balance, Math.max(0, value)));
    return { amount, value, cashGain, reason: `${tier}; cash +${cashGain}; target ${target ?? '-'} dEV ${dEV.toFixed(1)}; rack ${rackString(ctx.rack)}` };
  }

  word(ctx: GameContext): WordDecision {
    const plan = this.planner.plan(ctx.rack);
    if (!plan.words.length) return { word: null, reason: 'no playable word', planScore: 0 };
    const first = plan.words[0].text;
    if (ctx.remaining <= LIQUIDATION) return { word: first, reason: 'endgame liquidation', planScore: plan.score };
    const big = this.dictionary.playable(ctx.rack).filter(w => w.text.length >= 7 || w.score >= BIG_WORD);
    if (big.length) {
      // Best big word plus whatever the leftover tiles can still earn.
      const best = big.slice(0, 40).map(w => ({ w, total: w.score + this.planner.plan(subtract(ctx.rack, w.counts)).score }))
        .sort((a, b) => b.total - a.total)[0].w;
      // Cheap sevens wait for a richer one while we can still afford to grow the rack.
      // ponytail: 30 points is a guess from the 27-vs-53 gap; tune with live games.
      // Only hold while the builder tier is still bidding (tiles < BUILD_RACK); holding with bids off froze fit-v7 for 17 auctions.
      if (best.score < RICH_WORD && ctx.remaining > 34 && tileCount(ctx.rack) < BUILD_RACK && ctx.balance >= 10) {
        return { word: null, reason: `hold cheap ${best.text} (${best.score}) for a richer word`, planScore: plan.score };
      }
      return { word: best.text, reason: 'seven-letter or big word', planScore: plan.score };
    }
    if (tileCount(ctx.rack) >= this.policy.holdRackSize) return { word: first, reason: 'rack full without a seven', planScore: plan.score };
    // ponytail: a broke bot cannot grow its rack; sell one word rather than stall.
    if (ctx.balance < 3) return { word: first, reason: 'out of funds', planScore: plan.score };
    return { word: null, reason: 'hold for a seven-letter word', planScore: plan.score };
  }
}
