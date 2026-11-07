import { performance } from 'node:perf_hooks';
import { loadDictionary } from '../src/dictionary.js';
import { rackFrom } from '../src/letters.js';
import { POLICY_VERSION, Strategy } from '../src/strategy.js';

const started = performance.now();
const dictionary = loadDictionary();
console.log(JSON.stringify({ event: 'dictionary', multisets: dictionary.words.length, startupMs: Math.round(performance.now() - started) }));
const strategy = new Strategy(dictionary);
const racks = ['AEIRT', 'ACENRST', 'QUI', 'AEILNORST', 'BCDFGHJKLMNPQRSTVWXZ', 'AAEEIINORRST', 'ADEEIMSTUU', 'ABCDEEFGHIJKLMNO'];
const times: number[] = [];
for (const letters of racks) {
  const rack = rackFrom(letters);
  const ctx = { rack, balance: 100, remaining: 35, players: 6, auctionType: 'Vickrey' as const };
  const t = performance.now();
  const plan = strategy.planner.plan(rack);
  const planMs = performance.now() - t;
  for (const letter of ['A', 'E', 'S', 'T', 'Z']) {
    const bidStart = performance.now();
    const decision = strategy.bid(letter, ctx);
    times.push(performance.now() - bidStart);
    console.log(JSON.stringify({ rack: letters, letter, bid: decision.amount, ms: Math.round(times.at(-1)!), reason: decision.reason }));
  }
  console.log(JSON.stringify({ rack: letters, plan: plan.words.map(w => w.text), score: plan.score, bounded: plan.bounded, planMs: Math.round(planMs), play: strategy.word(ctx) }));
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ event: 'latency', policy: POLICY_VERSION, medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.floor(times.length * 0.95)], maxMs: times.at(-1) }));
