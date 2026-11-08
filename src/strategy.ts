import { Dictionary, type Word } from './dictionary.js';
import { BAG, VALUES, faceValue, fits, rackString, subtract, tileCount, type Rack } from './letters.js';
import { Planner, type Plan } from './planner.js';
import { maximumSimulatedBid, predictOpponentBid, predictOpponentBidQuantile, type OpponentProfile, type SimulatedStrategy } from './opponents.js';
// Winning-bid priors learned from LUCENT's live profile. Used only by the v13d clone arm.
const LUCENT_PRIOR: Record<string, number> = { A: 11, B: 15, C: 14, D: 13, E: 10, F: 19, G: 13, H: 22, I: 10, J: 35, K: 22, L: 10, M: 17, N: 9, O: 9, P: 16, Q: 34, R: 11, S: 11, T: 8, U: 11, V: 18, W: 20, X: 34, Y: 22, Z: 36 };
// sustainable-v9 = sustainable-v8 plus word banking for late purchasing power. V5_POLICY reproduces v5 exactly for A/B tests.
export const POLICY_VERSION = 'sustainable-v13';
export const BASE_REVISION = 'sustainable-v13';
export interface Policy {
  rewardWeight: number; investmentBase: number; investmentFace: number;
  holdMinLength: number; holdRackSize: number; cashoutBalance: number; opponentWeight: number;
  endgameBudget: number; balanceSmoothing: number;
  sustainability: number; reserveFraction: number;
  spendDown: number;
  lateAggression: number; lateBidModel: number; wordBank: number; wordBankUntil: number; mediumBankUntil: number; mediumBankScore: number;
  targetStrike: number; inventoryBuild: number; fragmentHoldUntil: number; lateSpendGainCap: number; upgradeHold: number;
  leaveAware: number; deadEndGuard: number; premiumPath: number; midShift: number; lateFloor: number; finalWord: number;
  portfolio: number; midQuota: number; secondReserve: number; lateTarget: number; opponentCap: number;
  ammoReserve: number; targetedMid: number; latePressure: number; lucent: number; winner: number;
}
export const V5_POLICY: Policy = { rewardWeight: 1.55, investmentBase: 6, investmentFace: 3,
  holdMinLength: 7, holdRackSize: 12, cashoutBalance: 18, opponentWeight: 0, endgameBudget: 1, balanceSmoothing: 1,
  sustainability: 1, reserveFraction: 0.55, spendDown: 0, lateAggression: 0, lateBidModel: 0, wordBank: 0, wordBankUntil: 20, mediumBankUntil: 0, mediumBankScore: 15,
  targetStrike: 0, inventoryBuild: 0, fragmentHoldUntil: 12, lateSpendGainCap: 0, upgradeHold: 0,
  leaveAware: 0, deadEndGuard: 0, premiumPath: 0, midShift: 0, lateFloor: 0, finalWord: 0,
  portfolio: 0, midQuota: 0, secondReserve: 0, lateTarget: 0, opponentCap: 0,
  ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0, winner: 0 };
// v8 pacing, from 49 live matches:
// 1. Keep the proven 0.55 midgame reserve; recent losses came from having no bankroll late, not from underbidding early.
// 2. Release that reserve and buy liquid letters in the last 16 auctions. Winners bought 5.06 late tiles while the
//    bot bought 0.51 and routinely stranded 20-40 coins.
// 3. lateBidModel uses 25,835 public match archives: roughly winner P60+1 for vowel/consonant by endgame phase.
export const DEFAULT_POLICY: Policy = { ...V5_POLICY, reserveFraction: 0.55, spendDown: 1, lateAggression: 1, lateBidModel: 1, wordBank: 1, mediumBankUntil: 8,
  targetStrike: 1, inventoryBuild: 1, fragmentHoldUntil: 8, lateSpendGainCap: 30, upgradeHold: 1,
  leaveAware: 1, deadEndGuard: 1, premiumPath: 1, midShift: 1, lateFloor: 1, finalWord: 1,
  portfolio: 0, midQuota: 1, secondReserve: 1, lateTarget: 1, opponentCap: 1,
  ammoReserve: 1, targetedMid: 1, latePressure: 1, lucent: 1, winner: 0 };
// v11 live revert: replay on 40 archived live matches scored v11 74.8 / 2.5 wins vs v12 73.2 / 0 wins.
export const V11_POLICY: Policy = { ...DEFAULT_POLICY, midShift: 0, lateFloor: 0, finalWord: 0, portfolio: 0, midQuota: 0, secondReserve: 0, lateTarget: 0, opponentCap: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0 };
export function validatePolicy(value: Partial<Policy>): Policy {
  const limits: Record<keyof Policy, [number, number]> = { rewardWeight: [1, 2.5], investmentBase: [2, 12], investmentFace: [1, 5],
    holdMinLength: [4, 7], holdRackSize: [8, 15], cashoutBalance: [10, 40], opponentWeight: [0, 0.8], endgameBudget: [0, 1], balanceSmoothing: [0, 1],
    sustainability: [0, 1], reserveFraction: [0.2, 0.8], spendDown: [0, 1], lateAggression: [0, 1], lateBidModel: [0, 1], wordBank: [0, 1], wordBankUntil: [10, 30], mediumBankUntil: [0, 12], mediumBankScore: [8, 30],
    targetStrike: [0, 1], inventoryBuild: [0, 1], fragmentHoldUntil: [0, 20], lateSpendGainCap: [0, 40], upgradeHold: [0, 1],
    leaveAware: [0, 1], deadEndGuard: [0, 1], premiumPath: [0, 1], midShift: [0, 1], lateFloor: [0, 1], finalWord: [0, 1],
    portfolio: [0, 1], midQuota: [0, 1], secondReserve: [0, 1], lateTarget: [0, 1], opponentCap: [0, 1],
    ammoReserve: [0, 1], targetedMid: [0, 1], latePressure: [0, 1], lucent: [0, 11], winner: [0, 6] };
  const policy = { ...DEFAULT_POLICY, ...value };
  for (const key of Object.keys(limits) as (keyof Policy)[]) {
    const [low, high] = limits[key];
    if (!Number.isFinite(policy[key]) || policy[key] < low || policy[key] > high) throw new Error(`Invalid policy parameter ${key}`);
  }
  if (!Number.isInteger(policy.holdMinLength) || !Number.isInteger(policy.holdRackSize) || !Number.isInteger(policy.lateBidModel) || !Number.isInteger(policy.wordBank) || !Number.isInteger(policy.wordBankUntil) || !Number.isInteger(policy.mediumBankUntil) || !Number.isInteger(policy.mediumBankScore) || !Number.isInteger(policy.targetStrike) || !Number.isInteger(policy.inventoryBuild) || !Number.isInteger(policy.fragmentHoldUntil) || !Number.isInteger(policy.lateSpendGainCap) || !Number.isInteger(policy.upgradeHold) || !Number.isInteger(policy.leaveAware) || !Number.isInteger(policy.deadEndGuard) || !Number.isInteger(policy.premiumPath) || !Number.isInteger(policy.midShift) || !Number.isInteger(policy.lateFloor) || !Number.isInteger(policy.finalWord) || !Number.isInteger(policy.portfolio) || !Number.isInteger(policy.midQuota) || !Number.isInteger(policy.secondReserve) || !Number.isInteger(policy.lateTarget) || !Number.isInteger(policy.opponentCap) || !Number.isInteger(policy.ammoReserve) || !Number.isInteger(policy.targetedMid) || !Number.isInteger(policy.latePressure) || !Number.isInteger(policy.lucent) || !Number.isInteger(policy.winner)) throw new Error('Hold thresholds must be integers');
  return policy;
}

export interface GameContext {
  rack: Rack;
  balance: number;
  remaining: number; // tiles still in the bag; the open auction is already drawn
  players: number;
  auctionType: 'Vickrey' | 'FirstPrice';
  frequencies?: number[];
  opponents?: { botId: number; balance: number; rackSize: number; score?: number; simulatedStrategy?: SimulatedStrategy }[];
  round?: number;
  totalAuctions?: number;
  activePlayers?: number;
  bought?: number;
  lateBought?: number;
  spent?: number;
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

  capitalReserve(ctx: GameContext): number {
    const total = ctx.totalAuctions ?? Math.max(68, ctx.remaining + 1);
    const release = this.policy.lateAggression && ctx.remaining < 16 ? Math.max(0, ctx.remaining / 16) : 1;
    return 100 * this.policy.reserveFraction * Math.pow(Math.min(1, ctx.remaining / total), 0.9) * release;
  }

  private leaveValue(rack: Rack): number {
    let value = faceValue(rack) * 0.7, vowels = 0;
    for (let i = 0; i < 26; i++) {
      if (!rack[i]) continue;
      const letter = String.fromCharCode(65 + i);
      if ('AEIOU'.includes(letter)) vowels += rack[i];
      if ('AEINORST'.includes(letter)) value += 1.8;
      if (rack[i] > 1) value -= (rack[i] - 1) * 1.5;
    }
    const tiles = tileCount(rack);
    if (tiles >= 3 && (!vowels || vowels === tiles)) value -= 3;
    if (rack[16] && !rack[20]) value -= 5;
    return Math.max(0, value);
  }

  private leaveAmmunition(rest: Rack): number {
    const tiles = tileCount(rest);
    const vowels = 'AEIOU'.split('').reduce((n, c) => n + rest[c.charCodeAt(0) - 65], 0);
    return this.leaveValue(rest) + faceValue(rest) * 0.35 + Math.min(vowels, 2) * 1.8 + (vowels > 0 && vowels < tiles ? 1.5 : 0);
  }

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

  private upgradeTarget(ctx: GameContext, first: Word): { word: Word; missing: number; cost: number; probability: number } | undefined {
    if (!this.policy.upgradeHold || ctx.remaining <= 5 || first.score >= 30 || tileCount(ctx.rack) < 3) return;
    const minimumScore = Math.max(20, first.score + 5);
    let best: { word: Word; missing: number; cost: number; probability: number; value: number } | undefined;
    for (const candidate of this.dictionary.candidates(ctx.rack, 1)) {
      if (candidate.missing.length !== 1 || candidate.word.score < minimumScore) continue;
      const missing = candidate.missing[0];
      const probability = this.completionProbability(candidate.missing, ctx);
      const cost = this.market.price(missing);
      if (probability <= 0.015 || ctx.balance < Math.ceil(cost)) continue;
      const value = (candidate.word.score - first.score - cost) * probability;
      if (!best || value > best.value) best = { word: candidate.word, missing, cost, probability, value };
    }
    return best;
  }

  private potential(ctx: GameContext, cash: Plan): { value: number; target?: Word; targets?: Word[]; pathLetters?: Set<number> } {
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
    const scored: { word: Word; value: number }[] = [];
    for (const option of options) {
      const owned = option.word.counts.slice();
      for (const slot of option.missing) owned[slot]--;
      const leftover = this.planner.plan(subtract(ctx.rack, owned));
      const upside = option.word.score + leftover.score - cash.score - option.futureCost;
      const candidate = cash.score + Math.max(0, upside) * option.probability;
      if (candidate > cash.score) scored.push({ word: option.word, value: candidate });
      if (candidate > value) value = candidate;
    }
    const targets = scored.sort((a, b) => b.value - a.value).slice(0, 3).map(option => option.word);
    const pathLetters = new Set(options.flatMap(option => option.missing));
    return { value, target: targets[0], targets, pathLetters };
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
    const createdScore = Math.max(0, ...this.dictionary.playable(after).filter(word => word.counts[slot] > ctx.rack[slot] && !fits(word.counts, ctx.rack)).map(word => word.score));
    const beforePotential = this.potential(ctx, beforePlan);
    const beforeValue = beforePotential.value;
    const afterPotential = this.potential(afterContext, afterPlan);
    const cashGain = afterPlan.score - beforePlan.score;
    const gain = Math.max(cashGain, afterPotential.value - beforeValue);
    const early = Math.min(1, ctx.remaining / 12);
    const phaseWeight = this.policy.midShift ? (ctx.remaining > 40 ? 0.75 : ctx.remaining > 16 ? 1.15 : 1) : 1;
    const have = ctx.rack[slot];
    const vowelCount = [...'AEIOU'].reduce((n, c) => n + ctx.rack[c.charCodeAt(0) - 65], 0);
    const tiles = tileCount(ctx.rack);
    const vowel = 'AEIOU'.includes(letter);
    let flexibility = early * phaseWeight * (have === 0 ? 2.0 : have === 1 ? 0.8 : 0.1);
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
    const flexibilityFloor = early * phaseWeight * learnedFloor * desiredVowel * duplicates
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
    // Premium letters deserve winner-style spikes only when they complete or advance a real high-value word.
    const premiumLetters = 'JKQXZWFVHY';
    const targetPool = this.policy.portfolio || this.policy.lucent >= 4 ? (afterPotential.targets ?? []) : (afterPotential.target ? [afterPotential.target] : []);
    const pathTarget = targetPool.filter(word => word.counts[slot] > ctx.rack[slot]).sort((a, b) => b.score - a.score)[0];
    const targetUsesLetter = !!pathTarget;
    const pathScore = Math.max(createdScore, pathTarget?.score ?? 0);
    const nearCompletion = !!pathTarget && this.dictionary.candidates(after, 1)
      .some(candidate => candidate.missing.length === 1 && candidate.word.text === pathTarget.text);
    const premiumStrike = this.policy.targetStrike
      && (createdScore >= (this.policy.premiumPath ? 20 : 30) || (this.policy.premiumPath && nearCompletion && pathScore >= 20))
      && (premiumLetters.includes(letter) || Math.max(createdScore, pathScore) >= 40);
    if (premiumStrike) value = Math.max(value, Math.min(50, 8 + pathScore * 0.65));
    // There is no value in unspent money after the match. Avoid burning the
    // bankroll on speculative tiles, but fund an immediately profitable play.
    const oldReserve = Math.min(10, Math.floor(ctx.remaining / 5));
    const lateCashFloor = this.policy.lateFloor && ctx.remaining >= 8 && ctx.remaining <= 12 && cashGain < 15 ? 16 : 0;
    const secondPathFloor = this.policy.ammoReserve && ctx.remaining >= 8 && ctx.remaining <= 15
      && beforePlan.score < 15 && (beforePotential.target?.score ?? 0) < 15 ? 28 : 0;
    const reserve = Math.max(oldReserve * (1 - this.policy.sustainability) + this.capitalReserve(ctx) * this.policy.sustainability,
      premiumStrike ? lateCashFloor * 0.5 : Math.max(lateCashFloor, secondPathFloor));
    const freeCash = Math.max(0, ctx.balance - reserve);
    // Short-word gains must not bypass the entire reserve. A seven-letter
    // completion can finance its own purchase through its immediate payout.
    const beforeLong = this.dictionary.playable(ctx.rack).some(w => w.text.length >= 7);
    const completedLong = !beforeLong ? this.dictionary.playable(after).filter(w => w.text.length >= 7)[0] : undefined;
    const recyclingBudget = completedLong ? completedLong.score * 0.7 : Math.max(0, cashGain) * 0.9;
    const sustainableBudget = Math.min(ctx.balance, Math.max(freeCash, recyclingBudget));
    const oldBudget = cashGain > 0 ? ctx.balance : Math.max(0, ctx.balance - oldReserve);
    let budget = oldBudget * (1 - this.policy.sustainability) + sustainableBudget * this.policy.sustainability;
    if (premiumStrike) budget = Math.max(budget, Math.min(ctx.balance, ctx.balance - reserve * 0.25));
    const firstPlanWord = beforePlan.words[0];
    const restRack = firstPlanWord ? subtract(ctx.rack, firstPlanWord.counts) : ctx.rack.slice();
    const afterRestRack = firstPlanWord ? subtract(after, firstPlanWord.counts) : after;
    const restPlan = this.planner.plan(restRack);
    const afterRestPlan = this.planner.plan(afterRestRack);
    const restPotential = this.potential({ ...ctx, rack: restRack }, restPlan);
    const afterRestPotential = this.potential({ ...afterContext, rack: afterRestRack }, afterRestPlan);
    const secondPathNeed = this.policy.lucent >= 1 && ctx.remaining > 16 && ctx.remaining <= 45
      && (firstPlanWord?.score ?? 0) >= 20 && tileCount(restRack) < 7
      && restPlan.score < 15 && (restPotential.target?.score ?? 0) < 20;
    const secondLetterUseful = afterRestPlan.score > restPlan.score || afterRestPotential.value > restPotential.value
      || (afterRestPotential.target?.score ?? 0) >= 15;
    const lucentProfile = this.profiles.get(18);
    const lucentExpected = lucentProfile
      ? predictOpponentBid(lucentProfile, letter, ctx.remaining, ctx.balance, tiles)
      : (LUCENT_PRIOR[letter] ?? 12) + (ctx.remaining <= 8 ? 6 : ctx.remaining <= 16 ? 4 : ctx.remaining <= 40 ? 2 : 0);
    const lucentP75 = lucentProfile?.letterBids[letter]?.p75
      ?? Math.ceil((LUCENT_PRIOR[letter] ?? 12) * 1.25);
    const lucentPace = this.policy.lucent >= 11 && lucentProfile
      ? predictOpponentBidQuantile(lucentProfile, letter, ctx.remaining, ctx.balance, tiles, 0.6)
      : this.policy.lucent >= 10 && lucentProfile
        ? predictOpponentBidQuantile(lucentProfile, letter, ctx.remaining, ctx.balance, tiles, 0.5)
        : this.policy.lucent >= 9 && lucentProfile
          ? predictOpponentBidQuantile(lucentProfile, letter, ctx.remaining, ctx.balance, tiles, 0.65) + 1
          : this.policy.lucent >= 8 && lucentProfile
            ? predictOpponentBidQuantile(lucentProfile, letter, ctx.remaining, ctx.balance, tiles, 0.95) + 1
            : this.policy.lucent >= 7 && lucentProfile
              ? predictOpponentBidQuantile(lucentProfile, letter, ctx.remaining, ctx.balance, tiles, 0.9) + 1
              : this.policy.lucent >= 6
        ? Math.max(lucentExpected + 6, lucentP75 + 1)
        : lucentExpected;
    const lucentRackNeed = this.policy.lucent >= 4 && ctx.remaining > 16
      && (firstPlanWord ? tileCount(restRack) < 7 : tiles < 9);
    const quotaNeed = this.policy.midQuota && ctx.remaining > 16 && ctx.remaining <= 40
      && ((beforePlan.score < (ctx.remaining > 20 ? 15 : 20) && (beforePotential.target?.score ?? 0) < 20)
        || (this.policy.lucent >= 1 && secondPathNeed));
    if (quotaNeed && have === 0 && (cashGain > 0 || targetUsesLetter || afterPlan.score >= 10 || secondLetterUseful)) {
      value = Math.max(value, vowel ? 17 : 19);
      budget = Math.max(budget, Math.min(ctx.balance, ctx.balance - reserve * 0.35));
    }
    const targetedMid = this.policy.targetedMid && ctx.remaining > 16 && ctx.remaining <= 40 && have === 0
      && (cashGain >= 8 || (nearCompletion && pathScore >= 20));
    if (targetedMid) {
      value = Math.max(value, Math.min(30, 14 + pathScore * 0.35));
      budget = Math.max(budget, Math.min(ctx.balance, ctx.balance - reserve * 0.2));
    }
    const lucentUseful = cashGain > 0 || targetUsesLetter || afterPlan.score > beforePlan.score
      || afterPotential.value > beforeValue || !!beforePotential.pathLetters?.has(slot);
    const lucentLetter = this.policy.lucent >= 5
      ? true
      : this.policy.lucent >= 4
        ? 'ABCDEFGHIKLMNOPRSTUVWY'.includes(letter) || (premiumLetters.includes(letter) && lucentUseful)
        : 'AEIOURSTNLDCBGMPH'.includes(letter) || (premiumLetters.includes(letter) && (targetUsesLetter || cashGain > 0));
    const lucentVolume = this.policy.lucent >= 1 && ctx.remaining > (this.policy.lucent >= 5 ? 1 : 16)
      && (this.policy.lucent < 5 || tiles < 14)
      && (this.policy.lucent >= 5 ? true : have === 0 || (this.policy.lucent >= 4 && have === 1 && lucentUseful))
      && lucentLetter && (this.policy.lucent >= 5
        ? true
        : this.policy.lucent >= 4
          ? (lucentUseful || secondLetterUseful || (lucentRackNeed && 'AEIOURSTNLDCBGMPH'.includes(letter)))
          : secondPathNeed && secondLetterUseful);
    if (lucentVolume) {
      const paced = this.policy.lucent >= 4
        ? Math.min(40, lucentPace + 1 + Math.min(6, cashGain * (this.policy.lucent >= 5 ? 0.2 : 0.3)))
        : (vowel ? 14 : 'FVWY'.includes(letter) ? 18 : 16);
      value = Math.max(value, paced);
      budget = Math.max(budget, Math.min(ctx.balance, ctx.balance - reserve * (this.policy.lucent >= 5 ? 0.1 : this.policy.lucent >= 4 ? 0.2 : 0.3)));
    }
    const winnerUseful = cashGain > 0 || targetUsesLetter || afterPlan.score > beforePlan.score
      || afterPotential.value > beforeValue || !!beforePotential.pathLetters?.has(slot);
    const winnerPremium = 'BCFHJKMPQVWXYZ'.includes(letter);
    const winnerBid = this.policy.winner === 1 || this.policy.winner >= 3;
    const winnerWord = this.policy.winner === 2 || this.policy.winner === 3 || this.policy.winner === 5;
    const aggressiveWinner = this.policy.winner >= 4;
    const winnerTarget = winnerBid && ctx.remaining > 1 && winnerUseful
      && (ctx.remaining <= 16
        ? (aggressiveWinner || cashGain >= 5 || (targetUsesLetter && pathScore >= 12))
        : ctx.remaining <= 40
          ? (cashGain >= (aggressiveWinner ? 5 : 8) || (targetUsesLetter && pathScore >= (winnerPremium ? 18 : 20)))
          : (cashGain >= (aggressiveWinner ? 8 : 10) || (targetUsesLetter && pathScore >= 25)));
    if (winnerTarget) {
      const winnerPrice = winnerPremium && pathScore >= 18
        ? Math.min(aggressiveWinner ? 50 : 45, (aggressiveWinner ? 16 : 12) + pathScore * (aggressiveWinner ? 0.45 : 0.5))
        : Math.min(aggressiveWinner ? 30 : 22, (aggressiveWinner ? 14 : 10) + pathScore * (aggressiveWinner ? 0.3 : 0.25));
      value = Math.max(value, winnerPrice + Math.min(6, Math.max(0, cashGain) * 0.2));
      budget = Math.max(budget, Math.min(ctx.balance, ctx.balance - (ctx.remaining <= 16 ? 8 : reserve * 0.15)));
    }
    // Winners build inventory before the panic window. Buy sparse-rack inventory in the transition phase,
    // while keeping speculative heavy letters gated by real completion value.
    const inventoryBuild = this.policy.lateAggression && this.policy.inventoryBuild && ctx.remaining > 16 && ctx.remaining <= 40
      && have === 0 && tiles < (beforePlan.score ? 5 : 8) && 'ABCDEFGHIKLMNOPRSTUVWY'.includes(letter);
    if (inventoryBuild) {
      value = Math.max(value, vowel ? (this.policy.midShift ? 15 : 12) : 'FVWY'.includes(letter) ? (this.policy.midShift ? 20 : 16) : (this.policy.midShift ? 17 : 14));
      budget = Math.max(budget, Math.min(ctx.balance, ctx.balance - reserve * 0.45));
    }
    // At the end, money has no later use. Keep the final unplayable tile guard.
    if (ctx.remaining <= (this.policy.lateAggression ? 16 : 4) && cashGain > 0 && (!lateCashFloor || cashGain >= 15)) budget = ctx.balance;
    // v8: leftover cash is worthless, so a small rack buys liquid letters in the last 16 auctions.
    let spendDown = false;
    const liquidLetters = ctx.remaining <= 8 ? 'ABCDEFGHIKLMNOPRSTUVWY' : 'AEIOURSTNLDC';
    const needsTiles = beforePlan.score === 0 ? tiles < 8 : tiles < 4;
    const afterVowels = 'AEIOU'.split('').reduce((n, c) => n + after[c.charCodeAt(0) - 65], 0);
    const deadEndBuy = this.policy.deadEndGuard && tileCount(after) >= 2 && afterVowels === 0
      && afterPlan.score === 0 && (afterPotential.target?.score ?? 0) < 15;
    const lateQuotaNeed = this.policy.winner === 6 && ctx.remaining >= 2 && ctx.remaining <= 16
      && ctx.lateBought !== undefined && ctx.lateBought < Math.ceil((16 - ctx.remaining + 1) * 3.9 / 16)
      && have === 0 && winnerUseful && !deadEndBuy;
    const lateTarget = (this.policy.lateTarget && ctx.remaining >= 2 && ctx.remaining <= 16 && have === 0
      && (cashGain >= (this.policy.latePressure ? 5 : 8) || (targetUsesLetter && pathScore >= (this.policy.latePressure ? 12 : 15)))) || lateQuotaNeed;
    if (this.policy.lateAggression && this.policy.spendDown && ctx.remaining >= 2 && ctx.remaining <= 16 && cashGain <= this.policy.lateSpendGainCap && have === 0 && (needsTiles || lateTarget) && (liquidLetters.includes(letter) || lateQuotaNeed) && !deadEndBuy) {
      const phase = ctx.remaining <= 4 ? 3 : ctx.remaining <= 8 ? 2 : ctx.remaining <= 12 ? 1 : 0;
      const archiveFloor = (vowel ? [14, 15, 17, 20] : [18, 19, 20, 22])[phase];
      const activity = Math.max(-1, Math.min(1, Math.round(((ctx.activePlayers ?? ctx.players) - 4.5) / 2)));
      const maxOpponentScore = Math.max(0, ...(ctx.opponents ?? []).map(opponent => opponent.score ?? 0));
      const maxOpponentRack = Math.max(0, ...(ctx.opponents ?? []).map(opponent => opponent.rackSize));
      const tableHeat = Math.min(5, Math.min(3, Math.floor(maxOpponentScore / 35)) + Math.min(2, Math.max(0, Math.floor((maxOpponentRack - 6) / 2))));
      const latePrice = this.policy.lateBidModel ? archiveFloor + activity + tableHeat
        : Math.max(14, Math.min(24, investment + 4 + 1.7 * ((ctx.activePlayers ?? ctx.players) - 4.5)));
      value = Math.max(value, latePrice + (lateTarget ? Math.min(this.policy.latePressure ? 14 : 8, pathScore * 0.3) : 0) + (lateQuotaNeed ? 3 : 0));
      budget = Math.max(budget, ctx.balance - (lateTarget ? Math.min(Math.max(lateCashFloor, secondPathFloor), 10) : Math.max(lateCashFloor, secondPathFloor))); spendDown = true;
    } else if (!this.policy.lateAggression && this.policy.spendDown && ctx.remaining >= 3 && ctx.remaining <= 16 && cashGain <= 0 && tiles < 8 && 'SRNTLEDC'.includes(letter)) {
      const spare = Math.max(0, ctx.balance - 5);
      value = Math.max(value, Math.min(8, spare)); budget = Math.max(budget, spare); spendDown = spare > 0;
    }
    if (ctx.auctionType === 'FirstPrice') {
      value = Math.min(value * 0.82, this.market.price(slot) + Math.max(1, value * 0.25));
    }
    let guaranteedWin = Infinity;
    if (ctx.opponents?.length && ctx.opponents.every(opponent => opponent.simulatedStrategy !== undefined)) {
      guaranteedWin = 1 + Math.max(...ctx.opponents.map(opponent => maximumSimulatedBid(opponent.simulatedStrategy!, letter, opponent.balance)));
    }
    const volumeBuy = lucentVolume && !targetedMid && !quotaNeed && !premiumStrike;
    const opponentCap = this.policy.opponentCap && forecasts.length && ((spendDown && !lateTarget) || volumeBuy)
      ? Math.max(opposition + 2, this.policy.lucent >= 4 && volumeBuy ? Math.min(38, lucentPace + 2) : 0) : Infinity;
    const cloneAmount = this.policy.lucent >= 10 && lucentVolume ? lucentPace : Infinity;
    const amount = Math.floor(Math.min(budget, guaranteedWin, opponentCap, cloneAmount, Math.max(0, value)));
    return { amount, value, cashGain, reason: `${spendDown ? 'spend-down; ' : ''}cash +${cashGain}; reserve ${Math.round(reserve)}; target ${afterPotential.target?.text ?? '-'}; rack ${rackString(ctx.rack)}` };
  }

  word(ctx: GameContext): WordDecision {
    const plan = this.planner.plan(ctx.rack);
    if (!plan.words.length) return { word: null, reason: 'no playable word', planScore: 0 };
    const playable = this.dictionary.playable(ctx.rack);
    const long = playable.filter(w => w.text.length >= 7);
    // Sell one word at a time. Among equivalent liquidation choices, preserve
    // a useful leave for the next word rather than repeatedly emptying the rack.
    const choices = (long.length ? long : playable).slice(0, 40);
    const future = ctx.balance <= this.policy.cashoutBalance || ctx.remaining <= 5 ? 0 : Math.min(1, ctx.remaining / 20) * this.policy.sustainability;
    let first = future ? choices.map(word => {
      const rest = subtract(ctx.rack, word.counts);
      const leave = this.policy.leaveAware ? this.leaveAmmunition(rest) : this.leaveValue(rest);
      const weight = this.policy.leaveAware && ctx.remaining <= 12 ? 1.8 : this.policy.leaveAware ? 0.7 : 1.8;
      return { word, utility: word.score + Math.max(this.planner.plan(rest).score, leave * weight * future) };
    }).sort((a, b) => b.utility - a.utility || b.word.score - a.word.score)[0].word : plan.words[0];
    const winnerWord = this.policy.winner === 2 || this.policy.winner === 3;
    if (this.policy.secondReserve && this.policy.lucent < 4 && first.score >= 20 && ctx.remaining <= (this.policy.lucent >= 2 ? 40 : 20) && ctx.remaining > 5) {
      const funded = playable.map(word => {
        const rest = subtract(ctx.rack, word.counts);
        return { word, rest, restScore: this.planner.plan(rest).score };
      }).filter(option => option.word.score >= 5 && option.word.score < 20 && tileCount(option.rest) >= 3
        && (option.restScore >= 10 || this.leaveAmmunition(option.rest) >= 4))
        .sort((a, b) => a.word.score - b.word.score)[0];
      if (funded) first = funded.word;
    }
    const leaveTiles = tileCount(subtract(ctx.rack, first.counts));
    const rackTiles = tileCount(ctx.rack);
    if (winnerWord && ctx.remaining > 5
      && ((first.score >= 30 && (ctx.remaining <= 45 || ctx.balance < 40))
        || (first.score >= 20 && (ctx.remaining <= 30 || ctx.balance < 45 || rackTiles >= 10))
        || (first.score >= 10 && (ctx.remaining <= 16 || ctx.balance < 20)))) {
      return { word: first.text, reason: 'winner cash recycle', planScore: plan.score };
    }
    if (this.policy.lucent >= 5 && ctx.remaining > 16
      && ((first.text.length >= 7 && rackTiles >= 8)
        || (first.score >= 20 && (rackTiles >= 8 || ctx.balance < 60))
        || (first.score >= 15 && (rackTiles >= 10 || ctx.balance < 35))
        || (first.score >= 10 && ctx.balance < 20))) {
      return { word: first.text, reason: 'LUCENT rack recycle', planScore: plan.score };
    }
    if (this.policy.lucent >= 4 && ctx.remaining > 16
      && ((first.text.length >= 7 && rackTiles >= 8)
        || (first.score >= 20 && (rackTiles >= 10 || ctx.balance < 50))
        || (first.score >= 15 && (rackTiles >= 11 || ctx.balance < 30)))) {
      return { word: first.text, reason: 'LUCENT rack recycle', planScore: plan.score };
    }
    if (this.policy.ammoReserve && this.policy.lucent < 4 && ctx.remaining > 20 && leaveTiles < 2 && ctx.balance > 20 && first.score < 30) {
      return { word: null, reason: 'preserve last ammunition', planScore: plan.score };
    }
    if (ctx.remaining <= 5) return { word: first.text, reason: 'endgame liquidation', planScore: plan.score };
    const upgrade = this.upgradeTarget(ctx, first);
    if (upgrade) {
      const missing = String.fromCharCode(65 + upgrade.missing);
      return { word: null, reason: `hold for ${missing} -> ${upgrade.word.text}`, planScore: plan.score };
    }
    if (this.policy.finalWord && this.policy.lucent < 4 && first.score >= 20 && ctx.remaining <= 10 && ctx.balance >= 8) {
      return { word: null, reason: `bank ${first.text} as final ammunition`, planScore: plan.score };
    }
    if (this.policy.secondReserve && this.policy.lucent < 4 && first.score >= 30 && ctx.balance <= (this.policy.lucent >= 2 ? 50 : 30) && ctx.remaining > 10) {
      return { word: first.text, reason: 'release bankroll lock', planScore: plan.score };
    }
    if (this.policy.lucent >= 3 && first.score >= 25 && ctx.remaining > 20 && ctx.balance < 70 && leaveTiles >= 2) {
      return { word: first.text, reason: 'cash recycling', planScore: plan.score };
    }
    if (ctx.balance <= this.policy.cashoutBalance) return { word: first.text, reason: 'replenish bidding funds', planScore: plan.score };
    if (this.policy.wordBank && long.length && ctx.remaining > this.policy.wordBankUntil && tileCount(ctx.rack) < 17) {
      return { word: null, reason: `bank ${first.text} for late ammunition`, planScore: plan.score };
    }
    if (this.policy.wordBank && first.text.length < 7 && first.score >= this.policy.mediumBankScore
      && ctx.remaining <= this.policy.wordBankUntil && ctx.remaining > this.policy.mediumBankUntil && tileCount(ctx.rack) < 17) {
      return { word: null, reason: `bank ${first.text} for late ammunition`, planScore: plan.score };
    }
    if (this.policy.wordBank && this.policy.mediumBankUntil && first.score >= this.policy.mediumBankScore
      && ctx.remaining <= this.policy.mediumBankUntil && ctx.remaining > 5) {
      return { word: first.text, reason: 'liquidate banked ammunition', planScore: plan.score };
    }
    if (first.text.length >= 7) return { word: first.text, reason: 'maximum length multiplier', planScore: plan.score };
    const shortHoldUntil = this.policy.wordBank ? this.policy.fragmentHoldUntil : 12;
    if (first.text.length < this.policy.holdMinLength && ctx.remaining > shortHoldUntil && tileCount(ctx.rack) < this.policy.holdRackSize && ctx.balance > 30) {
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
