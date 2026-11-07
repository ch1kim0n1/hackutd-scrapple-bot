import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promotionGate, rollbackEvidence, splitHistory } from '../src/evolution.js';
import { validateMatch, type HistoricalMatch, type RankedBot } from '../src/history.js';
import { buildProfiles } from '../src/opponents.js';
import { Market, validatePolicy } from '../src/strategy.js';
import { qualifyingWins } from '../src/versioning.js';

function match(id: number): HistoricalMatch {
  return { id, createdAt: id * 100_000, endedAt: id * 100_000 + 68_000, rackSize: 5, durationMs: 1000, auctionType: 'Vickrey',
    participants: Array.from({ length: 6 }, (_, i) => ({ botId: i + 1, score: i === 0 ? 5 : 0, balance: i === 0 ? 104 : 100 })),
    auctions: Array.from({ length: 68 }, (_, i) => ({ id: id * 100 + i, letter: i === 0 ? 'T' : 'E', winner: i === 0 ? 1 : undefined,
      paid: i === 0 ? 1 : 0, topBid: i === 0 ? 3 : 0, opensAt: id * 100_000 + i * 1000,
      at: id * 100_000 + (i + 1) * 1000, remaining: 67 - i })),
    plays: [{ id, botId: 1, word: 'CAT', reward: 5, at: id * 100_000 + 1100 }] };
}
const leader: RankedBot = { botId: 1, name: 'test', rating: 2000, spread: 30, versionStartedAt: 0, matchesPlayed: 20, wins: 10 };
test('history validation reconciles rewards, payments and completed bag coverage', () => {
  assert.deepEqual(validateMatch(match(1)), []);
  const missing = match(1); missing.auctions.pop(); assert(validateMatch(missing).some(e => e.includes('coverage')));
  const wrong = match(1); wrong.participants[0].balance = 105; assert(validateMatch(wrong).some(e => e.includes('balance mismatch')));
});
test('training records and chronological holdout never overlap', () => {
  const matches = Array.from({ length: 40 }, (_, i) => match(i + 1));
  const split = splitHistory([leader], matches);
  assert.equal(split.holdout.length, 10);
  assert(split.holdout.every(m => m.id >= 31));
  assert(!split.train.some(m => split.holdout.some(h => h.id === m.id)));
});
test('opening-state model features exclude the awarded tile and later word reward', () => {
  const profiles = buildProfiles([leader], [match(1)]);
  const bid = profiles[0].bidObservations[0];
  assert.equal(bid.balance, 100); assert.equal(bid.rackSize, 5); assert.equal(bid.duplicatesKnown, 0);
  assert.equal(profiles[0].medianRackAtPlay, 6);
  assert.equal(profiles[0].medianBalanceAtPlay, 99);
});
test('promotion requires enough independent validation seeds and positive evidence', () => {
  assert(!promotionGate(Array(8).fill(1)).pass);
  assert(!promotionGate(Array(20).fill(-1)).pass);
  assert(!promotionGate(Array(20).fill(0)).pass);
  assert(promotionGate(Array(20).fill(0.5)).pass);
  assert(!promotionGate(Array.from({ length: 20 }, (_, i) => i % 2 ? 3 : -2.9)).pass);
});
test('unbounded or malformed learned policies cannot enter the live bot', () => {
  assert.throws(() => validatePolicy({ investmentBase: 999 }));
  assert.throws(() => validatePolicy({ rewardWeight: NaN }));
  assert.throws(() => validatePolicy({ holdMinLength: 6.5 }));
});
test('market learning survives restore and does not count the same auction twice', () => {
  const first = new Market(); first.observe('E', 12, 'one');
  const next = new Market(); next.restore(first.snapshot()); next.observe('E', 2, 'one');
  assert.deepEqual(next.snapshot(), first.snapshot());
});
test('rollback requires sustained comparable live degradation', () => {
  const good = Array.from({ length: 8 }, (_, i) => ({ ...match(i + 1), policy: 'old', score: 160, rank: 1 }));
  const bad = Array.from({ length: 8 }, (_, i) => ({ ...match(i + 20), policy: 'new', score: 30, rank: 5 }));
  assert(rollbackEvidence(good, bad).rollback);
  assert(!rollbackEvidence(good, bad.slice(0, 3)).rollback);
  assert(!rollbackEvidence(good, good).rollback);
});
test('website v2 counts only distinct valid wins after the user request', () => {
  const plan = { target: 2, winsRequired: 2, armedAt: 1000, state: 'armed' as const };
  assert.deepEqual(qualifyingWins(plan, [
    { id: 1, endedAt: 500, rank: 1 }, { id: 2, endedAt: 1100, rank: 2 },
    { id: 3, endedAt: 1200, rank: 1 }, { id: 3, endedAt: 1200, rank: 1 },
    { id: 4, endedAt: 1300, rank: 1, qualityErrors: ['missing sale'] },
    { id: 5, endedAt: 1400, rank: 1 },
  ]), [3, 5]);
});
