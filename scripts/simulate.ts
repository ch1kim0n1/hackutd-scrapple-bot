import { writeFileSync } from 'node:fs';
import { loadDictionary } from '../src/dictionary.js';
import { simulate } from '../src/simulation.js';
import { POLICY_VERSION } from '../src/strategy.js';
const dictionary = loadDictionary();
const games = Number(process.env.GAMES ?? 12);
const opposition = process.env.OPPONENTS === 'aggressive' ? 'aggressive' : process.env.OPPONENTS === 'strategic' ? 'strategic' : process.env.OPPONENTS === 'patient' ? 'patient' : process.env.OPPONENTS === 'server' ? 'server' : 'starter';
const results = [];
for (let seed = 1; seed <= games; seed++) {
  const baseline = simulate(dictionary, seed, false, opposition);
  const hero = simulate(dictionary, seed, true, opposition);
  results.push({ seed, baseline, hero });
  console.log(JSON.stringify({ seed, baselineScore: baseline.hero, score: hero.hero, rank: hero.rank, win: hero.win }));
}
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const summary = { policy: POLICY_VERSION, games, opposition, baselineMean: mean(results.map(r => r.baseline.hero)),
  meanScore: mean(results.map(r => r.hero.hero)), wins: results.filter(r => r.hero.win).length,
  meanRank: mean(results.map(r => r.hero.rank)) };
console.log(JSON.stringify(summary));
writeFileSync(`data/simulation-${opposition}.json`, JSON.stringify({ summary, results }, null, 2));
