import { readFileSync, writeFileSync } from 'node:fs';
import { loadDictionary } from '../src/dictionary.js';
import { simulate } from '../src/simulation.js';
import { DEFAULT_POLICY } from '../src/strategy.js';

const dictionary = loadDictionary();
const profiles = JSON.parse(readFileSync('data/learning/profiles.json', 'utf8')).profiles;
const games = Number(process.env.GAMES ?? 32);
const offset = Number(process.env.SEED_OFFSET ?? 90_000);
const mode = process.env.OPPONENTS === 'aggressive' ? 'aggressive' : 'observed';
const cases = [];
for (let i = 0; i < games; i++) {
  const seed = offset + i;
  const before = simulate(dictionary, seed, true, mode, { profiles, legacyHero: true });
  const after = simulate(dictionary, seed, true, mode, { profiles, policy: DEFAULT_POLICY });
  cases.push({ seed, before, after });
  console.log(JSON.stringify({ seed, beforeScore: before.hero, afterScore: after.hero, beforeRank: before.rank, afterRank: after.rank }));
  await new Promise(resolve => setImmediate(resolve));
}
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const summary = { mode, games, policy: DEFAULT_POLICY, before: { score: mean(cases.map(c => c.before.hero)), rank: mean(cases.map(c => c.before.rank)), wins: cases.filter(c => c.before.win).length },
  after: { score: mean(cases.map(c => c.after.hero)), rank: mean(cases.map(c => c.after.rank)), wins: cases.filter(c => c.after.win).length },
  lateScoreGainBefore: mean(cases.map(c => c.before.hero - (c.before.checkpoints.find(p => p.round === 40)?.score ?? 0))),
  lateScoreGainAfter: mean(cases.map(c => c.after.hero - (c.after.checkpoints.find(p => p.round === 40)?.score ?? 0))) };
writeFileSync(`data/upgrade-${mode}-${offset}.json`, JSON.stringify({ summary, cases }, null, 2));
console.log(JSON.stringify(summary));
