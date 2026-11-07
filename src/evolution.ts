import type { HistoricalMatch, RankedBot } from './history.js';
import { buildProfiles, quantile } from './opponents.js';
import { validatePolicy, type Policy } from './strategy.js';

export function promotionGate(differences: number[]): { pass: boolean; mean: number; lower95: number; n: number } {
  const n = differences.length;
  if (n < 16 || differences.some(d => !Number.isFinite(d))) return { pass: false, mean: 0, lower95: -Infinity, n };
  const mean = differences.reduce((a, b) => a + b, 0) / n;
  const variance = differences.reduce((s, d) => s + (d - mean) ** 2, 0) / (n - 1);
  const lower95 = mean - 2.15 * Math.sqrt(variance / n);
  return { pass: mean > 0.05 && lower95 > 0, mean, lower95, n };
}
export interface LiveResult { policy: string; mixedPolicy?: boolean; score: number; rank: number; endedAt: number; durationMs: number; rackSize: number; participants: { botId: number }[] }
export function rollbackEvidence(before: LiveResult[], after: LiveResult[]) {
  const key = (r: LiveResult) => `${r.durationMs}:${r.rackSize}:` + r.participants.map(p => p.botId).sort((a, b) => a - b).join(',');
  const common = new Set(after.map(key).filter(k => before.some(b => key(b) === k)));
  const baseline = before.filter(r => !r.mixedPolicy && common.has(key(r))).slice(-16);
  const current = after.filter(r => !r.mixedPolicy && common.has(key(r))).slice(-16);
  if (baseline.length < 8 || current.length < 8) return { rollback: false, reason: 'not enough comparable live games' };
  const values = (rs: LiveResult[]) => rs.map(r => r.participants.length - r.rank + r.score / 150);
  const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
  const variance = (ns: number[]) => ns.reduce((a, b) => a + (b - mean(ns)) ** 2, 0) / Math.max(1, ns.length - 1);
  const old = values(baseline), next = values(current);
  const difference = mean(next) - mean(old);
  const upper95 = difference + 2.2 * Math.sqrt(variance(old) / old.length + variance(next) / next.length);
  return { rollback: difference < -0.5 && upper95 < 0, difference, upper95, baselineN: old.length, currentN: next.length,
    reason: 'conservative comparison within the same table composition and game defaults' };
}

export function splitHistory(leaders: RankedBot[], history: HistoricalMatch[]) {
  const holdout = new Set<number>();
  for (const leader of leaders) {
    const matches = history.filter(m => m.createdAt >= leader.versionStartedAt && m.participants.some(p => p.botId === leader.botId))
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 40);
    for (const match of matches.slice(0, Math.max(8, Math.floor(matches.length / 4)))) holdout.add(match.id);
  }
  return { train: history.filter(m => !holdout.has(m.id)), holdout: history.filter(m => holdout.has(m.id)) };
}

export function proposePolicies(current: Policy, leaders: RankedBot[], training: HistoricalMatch[], selfLosses: { endingBalance: number; leftoverScore: number }[] = [], explorationSeed = 1): { name: string; policy: Policy }[] {
  const profiles = buildProfiles(leaders, training).filter(p => p.matches >= 8);
  if (!profiles.length) return [];
  const holdMinLength = Math.max(4, Math.min(7, Math.round(quantile(profiles.map(p => p.medianWordLength), 0.5))));
  const holdRackSize = Math.max(8, Math.min(15, Math.round(quantile(profiles.map(p => p.medianRackAtPlay), 0.5))));
  const cashoutBalance = Math.max(10, Math.min(40, Math.round(quantile(profiles.map(p => p.medianBalanceAtPlay), 0.5))));
  const moneyLeft = quantile(selfLosses.map(m => m.endingBalance), 0.5);
  const candidates = [
    { name: 'leader-word-timing', policy: validatePolicy({ ...current, holdMinLength, holdRackSize, cashoutBalance }) },
    { name: 'opponent-prices', policy: validatePolicy({ ...current, opponentWeight: 0.5, rewardWeight: 1.8 }) },
    { name: 'leader-combination', policy: validatePolicy({ ...current, holdMinLength, holdRackSize, cashoutBalance, opponentWeight: 0.65, rewardWeight: 1.9 }) },
    { name: 'loss-budget-response', policy: validatePolicy({ ...current, investmentBase: Math.min(12, current.investmentBase + (moneyLeft > 30 ? 1 : -0.5)),
      cashoutBalance: Math.min(40, Math.max(10, current.cashoutBalance + 5)) }) },
    { name: 'efficient-completions', policy: validatePolicy({ ...current, rewardWeight: 1.85, investmentBase: 4.5, investmentFace: 2.5, holdMinLength: 5, cashoutBalance: 25 }) },
    { name: 'long-word-compounding', policy: validatePolicy({ ...current, rewardWeight: 2.1, investmentBase: 8, investmentFace: 3.5,
      holdMinLength: 7, holdRackSize: 11, cashoutBalance: 25, opponentWeight: 0.5 }) },
    { name: 'cash-shadow-endgame', policy: validatePolicy({ ...current, endgameBudget: 1, balanceSmoothing: 1 }) },
    { name: 'patient-cash-shadow', policy: validatePolicy({ ...current, endgameBudget: 1, balanceSmoothing: 1, holdMinLength: 7, holdRackSize: 11, cashoutBalance: 25 }) },
  ];
  let state = explorationSeed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  for (let i = 0; i < 3; i++) candidates.push({ name: `bounded-exploration-${explorationSeed}-${i}`, policy: validatePolicy({
    rewardWeight: clamp(current.rewardWeight + (random() - 0.5) * 0.8, 1, 2.5),
    investmentBase: clamp(current.investmentBase + (random() - 0.5) * 3, 2, 12),
    investmentFace: clamp(current.investmentFace + (random() - 0.5) * 1.5, 1, 5),
    holdMinLength: clamp(current.holdMinLength + Math.round((random() - 0.5) * 2), 4, 7),
    holdRackSize: clamp(current.holdRackSize + Math.round((random() - 0.5) * 4), 8, 15),
    cashoutBalance: clamp(current.cashoutBalance + Math.round((random() - 0.5) * 16), 10, 40),
    opponentWeight: clamp(current.opponentWeight + (random() - 0.2) * 0.5, 0, 0.8),
    endgameBudget: random(), balanceSmoothing: random(),
    sustainability: current.sustainability,
    reserveFraction: clamp(current.reserveFraction + (random() - 0.5) * 0.2, 0.2, 0.8),
  }) });
  return candidates.filter(candidate => JSON.stringify(candidate.policy) !== JSON.stringify(current));
}
