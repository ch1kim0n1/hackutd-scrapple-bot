import { Dictionary, type Word } from './dictionary.js';
import { BAG, VALUES, rackString, subtract, tileCount, type Rack } from './letters.js';
import { Planner, type Plan } from './planner.js';
import { predictOpponentBid, type OpponentProfile } from './opponents.js';
export const POLICY_VERSION = 'adaptive-v4';
export const BASE_REVISION = 'v3-empty-rack-fix';
export interface Policy {
  rewardWeight: number; investmentBase: number; investmentFace: number;
  holdMinLength: number; holdRackSize: number; cashoutBalance: number; opponentWeight: number;
  endgameBudget: number; balanceSmoothing: number;
}
export const DEFAULT_POLICY: Policy = { rewardWeight: 1.55, investmentBase: 6, investmentFace: 3,
  holdMinLength: 6, holdRackSize: 10, cashoutBalance: 18, opponentWeight: 0, endgameBudget: 0, balanceSmoothing: 0 };
export function validatePolicy(value: Partial<Policy>): Policy {
  const limits: Record<keyof Policy, [number, number]> = { rewardWeight: [1, 2.5], investmentBase: [2, 12], investmentFace: [1, 5],
    holdMinLength: [4, 7], holdRackSize: [8, 15], cashoutBalance: [10, 40], opponentWeight: [0, 0.8], endgameBudget: [0, 1], balanceSmoothing: [0, 1] };
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
  constructor(readonly dictionary: Dictionary, policy: Partial<Policy> = {}) { this.planner = new Planner(dictionary); this.policy = validatePolicy(policy); }
  setPolicy(policy: Partial<Policy>) { this.policy = validatePolicy(policy); }
  setProfiles(profiles: OpponentProfile[]) { this.profiles = new Map(profiles.map(p => [p.botId, p])); }

  private completionProbability(missing: number[], ctx: GameContext): number {
    const frequencies = ctx.frequencies ?? BAG.map(n => n / 98);
    const counts = new Map<number, number>();
    for (const slot of missing) counts.set(slot, (counts.get(slot) ?? 0) + 1);
    let probability = 1;
    // We can target a letter selectively, but cannot assume we win every copy.
    const horizon = Math.min(ctx.remaining, 22);
    const winFraction = Math.max(0.28, Math.min(0.8, 2.4 / Math.max(2, ctx.players)));
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

  bid(letter: string, ctx: GameContext): BidDecision {
    if (ctx.balance < 1) return { amount: 0, value: 0, reason: 'no funds' };
    // The server resolves the last auction and ends the match atomically.
    if (ctx.remaining === 0) return { amount: 0, value: 0, reason: 'final tile cannot be played' };
    const slot = letter.charCodeAt(0) - 65;
    const after = ctx.rack.slice(); after[slot]++;
    const beforePlan = this.planner.plan(ctx.rack);
    const afterContext = { ...ctx, rack: after };
    const afterPlan = this.planner.plan(after);
    const beforeValue = this.potential(ctx, beforePlan).value;
    const afterPotential = this.potential(afterContext, afterPlan);
    const cashGain = afterPlan.score - beforePlan.score;
    const gain = Math.max(cashGain, afterPotential.value - beforeValue);
    const early = Math.min(1, ctx.remaining / 12);
    const have = ctx.rack[slot];
    const vowelCount = [...'AEIOU'].reduce((n, c) => n + ctx.rack[c.charCodeAt(0) - 65], 0);
    const tiles = tileCount(ctx.rack);
    const vowel = 'AEIOU'.includes(letter);
    let flexibility = early * (have === 0 ? 2.0 : have === 1 ? 0.8 : 0.1);
    if (vowel && vowelCount < Math.max(1, tiles * 0.3)) flexibility += 1.5 * early;
    if (letter === 'S' && have < 2) flexibility += 1.2 * early;
    if (letter === 'Q' && !ctx.rack[20] && cashGain === 0) flexibility *= 0.15;
    const scarcity = ctx.balance < 12 ? 0.68 : ctx.balance < 25 ? 0.82 : 1;
    // Small racks need investment before a complete word exists. A pure
    // immediate-score marginal bid otherwise loses every common tile and stalls.
    // Empty racks have no vowel imbalance. The old 0/1 fallback treated an
    // empty rack as consonant-heavy and discounted every new consonant.
    const vowelRatio = tiles ? vowelCount / tiles : 0.4;
    const imbalanceDiscount = 0.55 + 0.25 * this.policy.balanceSmoothing;
    const desiredVowel = vowel ? (vowelRatio < 0.5 ? 1 : imbalanceDiscount)
      : (vowelRatio > 0.2 ? 1 : imbalanceDiscount);
    const duplicates = have === 0 ? 1 : have === 1 ? 0.65 : 0.2;
    const forecasts = (ctx.opponents ?? []).flatMap(opponent => {
      const profile = this.profiles.get(opponent.botId);
      return profile ? [predictOpponentBid(profile, letter, ctx.remaining, opponent.balance, opponent.rackSize)] : [];
    });
    const opposition = forecasts.length ? Math.max(...forecasts) : 0;
    const investment = Math.max(this.market.price(slot) + 2, this.policy.investmentBase + this.policy.investmentFace * VALUES[slot]);
    const learnedFloor = investment + this.policy.opponentWeight * Math.max(0, opposition + 1 - investment);
    const flexibilityFloor = early * learnedFloor * desiredVowel * duplicates
      * (letter === 'Q' && !ctx.rack[20] ? 0.1 : 1);
    // A word earns both score and spendable currency. Treating its reward
    // solely as future cash undervalues it in a finite score-maximizing game.
    let value = Math.max(0, gain * this.policy.rewardWeight + flexibility, flexibilityFloor * (ctx.balance > 70 ? 1.15 : 1)) * scarcity;
    if (cashGain > 0 && ctx.remaining < 20) {
      const expectedPurchases = Math.max(1, ctx.remaining / Math.max(2, ctx.players / 2));
      const surplus = Math.min(5, Math.max(1, ctx.balance / Math.max(1, expectedPurchases * this.market.price(slot))));
      value *= 1 + this.policy.endgameBudget * Math.min(1, (20 - ctx.remaining) / 12) * (surplus - 1);
    }
    if (ctx.remaining === 1 && cashGain > 0) value = ctx.balance;
    // There is no value in unspent money after the match. Avoid burning the
    // bankroll on speculative tiles, but fund an immediately profitable play.
    const reserve = Math.min(10, Math.floor(ctx.remaining / 5));
    const budget = cashGain > 0 ? ctx.balance : Math.max(0, ctx.balance - reserve);
    if (ctx.auctionType === 'FirstPrice') {
      value = Math.min(value * 0.82, this.market.price(slot) + Math.max(1, value * 0.25));
    }
    const amount = Math.min(budget, Math.max(0, Math.floor(value)));
    return { amount, value, cashGain, reason: `cash +${cashGain}; target ${afterPotential.target?.text ?? '-'}; rack ${rackString(ctx.rack)}` };
  }

  word(ctx: GameContext): WordDecision {
    const plan = this.planner.plan(ctx.rack);
    if (!plan.words.length) return { word: null, reason: 'no playable word', planScore: 0 };
    const first = plan.words[0];
    if (ctx.remaining <= 5) return { word: first.text, reason: 'endgame liquidation', planScore: plan.score };
    if (ctx.balance <= this.policy.cashoutBalance) return { word: first.text, reason: 'replenish bidding funds', planScore: plan.score };
    if (first.text.length >= 7) return { word: first.text, reason: 'maximum length multiplier', planScore: plan.score };
    if (first.text.length < this.policy.holdMinLength && ctx.remaining > 12 && tileCount(ctx.rack) < this.policy.holdRackSize && ctx.balance > 30) {
      return { word: null, reason: 'build a rack for the length bonus', planScore: plan.score };
    }
    const now = this.potential(ctx, plan);
    const after = { ...ctx, rack: subtract(ctx.rack, first.counts), balance: ctx.balance + first.score };
    const rest = this.planner.plan(after.rack);
    const playValue = first.score + this.potential(after, rest).value;
    // Waiting has a cost: fewer future auctions and money locked in the rack.
    const waitingAdvantage = now.value - playValue;
    const patience = first.text.length <= 3 ? 1.8 : 3;
    if (waitingAdvantage > patience && tileCount(ctx.rack) < 17) {
      return { word: null, reason: `hold for ${now.target?.text ?? 'completion'} (+${waitingAdvantage.toFixed(1)} expected)`, planScore: plan.score };
    }
    return { word: first.text, reason: 'best word combination', planScore: plan.score };
  }
}
