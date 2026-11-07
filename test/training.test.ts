import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExamples, chronologicalSplits, FEATURE_NAMES } from '../src/training.js';
import { TrainingStore, unpack } from '../src/training-store.js';
import { DecisionRecorder } from '../src/recording.js';
import { rackFrom } from '../src/letters.js';
import type { HistoricalMatch } from '../src/history.js';

function game(): HistoricalMatch {
  return { id: 1, createdAt: 0, endedAt: 68_000, rackSize: 5, durationMs: 1000, auctionType: 'Vickrey',
    participants: Array.from({ length: 6 }, (_, i) => ({ botId: i + 1, score: i === 0 ? 5 : 0, balance: i === 0 ? 104 : 100 })),
    auctions: Array.from({ length: 68 }, (_, i) => ({ id: i + 1, letter: 'T', winner: i === 0 ? 1 : undefined,
      paid: i === 0 ? 1 : 0, topBid: i === 0 ? 3 : undefined, opensAt: i * 1000, at: (i + 1) * 1000, remaining: 67 - i })),
    plays: [{ id: 1, botId: 1, word: 'CAT', reward: 5, at: 1100 }] };
}
test('training features exclude the auction result and future word reward', () => {
  const samples = buildExamples(game());
  const first = samples.find(e => e.id === '1:auction:1:bot:1')!;
  assert.equal(first.features.balance, 100); assert.equal(first.features.score, 0);
  assert.equal(first.features.rackSize, 5); assert.equal(first.features.offeredCounts[19], 0);
  assert.equal(first.targets.clearingPrice, 1); assert.equal(first.targets.finalScore, 5);
  assert.equal(first.x.length, FEATURE_NAMES.length);
  assert(first.xMask.slice(0, 26).every(n => n === 0));
  const changed = game(); changed.auctions[0].topBid = 99; changed.participants[0].score = 999;
  assert.deepEqual(buildExamples(changed)[0].x, first.x);
  const second = samples.find(e => e.id === '1:auction:2:bot:1')!;
  assert.equal(second.features.balance, 100, 'equal timestamps cannot leak the preceding sale');
  const third = samples.find(e => e.id === '1:auction:3:bot:1')!;
  assert.equal(third.features.balance, 104); assert.equal(third.features.score, 5);
});
test('unknown losing bids stay null rather than becoming zero-bid labels', () => {
  const loss = buildExamples(game()).find(e => e.id === '1:auction:1:bot:2')!;
  assert.equal(loss.action.bidAmount, null); assert.equal(loss.action.bidAmountKnown, false);
});
test('live recorder freezes decision inputs and records failures separately', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scrabble-recording-'));
  try {
    const recorder = new DecisionRecorder(dir), rack = rackFrom('CATOO');
    const capture = recorder.capture(1, 1, 'test-policy', 'bid', { rack, balance: 100, remaining: 67, players: 6, auctionType: 'Vickrey' },
      { auctionId: 1, letter: 'T', score: 0, offeredCounts: Array(26).fill(0), opponents: [] });
    rack.fill(0); recorder.append(capture, { amount: 3, accepted: false, status: 'failed' });
    const saved = JSON.parse(readFileSync(`${dir}/1.jsonl`, 'utf8'));
    assert.equal(saved.features.rack.reduce((a: number, b: number) => a + b, 0), 5);
    const samples = buildExamples(game(), [saved, saved]);
    assert.equal(samples.filter(e => e.kind === 'own_bid').length, 1);
    const own = samples.find(e => e.kind === 'own_bid')!;
    assert.equal(own.action.accepted, false); assert.equal(own.action.status, 'failed');
    assert(own.xMask.slice(0, 26).every(n => n === 1));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('training store is idempotent and preserves invalid games in quarantine', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scrabble-training-'));
  const store = new TrainingStore(`${dir}/games.sqlite`);
  try {
    assert(store.ingest(game())); assert(!store.ingest(game()));
    assert.equal(store.stats().games, 1);
    const invalid = game(); invalid.id = 2; invalid.auctions.pop();
    store.ingest(invalid, undefined, [], { original: 'preserved' });
    const row = store.db.prepare('SELECT * FROM games WHERE match_id=2').get()!;
    assert.equal(row.quality, 'quarantined');
    assert.deepEqual(unpack(row.raw_gzip as Uint8Array), { original: 'preserved' });
    assert.deepEqual(unpack(row.examples_gzip as Uint8Array), []);
    assert.equal(store.stats().games, 2); assert.equal(store.stats().validGames, 1);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('all examples from a match share one chronological split', () => {
  const split = chronologicalSplits(Array.from({ length: 20 }, (_, i) => ({ id: i + 1, endedAt: i * 1000 })));
  assert.equal([...split.values()].filter(s => s === 'train').length, 16);
  assert.equal(split.get(17), 'validation'); assert.equal(split.get(19), 'test');
  const reordered = chronologicalSplits([{ id: 3, endedAt: 300 }, { id: 1, endedAt: 100 }, { id: 2, endedAt: 200 }]);
  assert.equal(reordered.get(3), 'test');
});
