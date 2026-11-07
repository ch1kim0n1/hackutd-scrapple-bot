import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, appendFileSync } from 'node:fs';
import { setPriority } from 'node:os';
import { loadDictionary } from '../src/dictionary.js';
import { buildProfiles } from '../src/opponents.js';
import { BASE_REVISION, DEFAULT_POLICY, POLICY_VERSION, validatePolicy, type Policy } from '../src/strategy.js';
import { promotionGate, proposePolicies, rollbackEvidence, splitHistory } from '../src/evolution.js';
import { simulate } from '../src/simulation.js';

const execute = promisify(execFile);
try { setPriority(0, 10); } catch {}
mkdirSync('data/learning', { recursive: true }); mkdirSync('.run', { recursive: true }); mkdirSync('logs', { recursive: true });
const record = (event: string, details: Record<string, unknown> = {}) => {
  const row = JSON.stringify({ time: new Date().toISOString(), event, ...details });
  console.log(row); appendFileSync('data/learning/evolution.jsonl', row + '\n');
};
const child = async (script: string) => {
  const { stdout } = await execute(process.execPath, ['--import', 'tsx', script], { maxBuffer: 32 * 1024 * 1024, timeout: 120_000 });
  record('refresh', { script, output: stdout.trim() });
};
const dictionary = loadDictionary();
const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const fitness = (result: ReturnType<typeof simulate>) => 6 - result.rank + result.hero / 150;

async function cycle() {
  writeFileSync('.run/learner-status.json', JSON.stringify({ pid: process.pid, time: new Date().toISOString(), phase: 'collecting' }));
  await child('scripts/collect-opponents.ts'); await child('scripts/profile-opponents.ts');
  const history = JSON.parse(readFileSync('data/learning/history.json', 'utf8'));
  const split = splitHistory(history.leaders, history.matches);
  const trainingIds = new Set(split.train.map((m: { id: number }) => m.id));
  const trainProfiles = buildProfiles(history.leaders, split.train);
  const holdoutProfiles = buildProfiles(history.leaders, split.holdout);
  if (trainProfiles.some(p => p.matches < 8) || holdoutProfiles.some(p => p.matches < 8)) {
    record('insufficient_history', { training: trainProfiles.map(p => p.matches), holdout: holdoutProfiles.map(p => p.matches) }); return;
  }
  let champion = existsSync('.run/champion.json') ? JSON.parse(readFileSync('.run/champion.json', 'utf8')) : { revision: BASE_REVISION, policy: DEFAULT_POLICY };
  const ownGames = existsSync('data/learning/self') ? readdirSync('data/learning/self').filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(`data/learning/self/${f}`, 'utf8')))
    .filter(r => !r.qualityErrors?.length).sort((a, b) => a.endedAt - b.endedAt) : [];
  if (champion.previous && champion.selectedAt) {
    const selection = Date.parse(champion.selectedAt);
    const rollback = rollbackEvidence(ownGames.filter(r => r.endedAt < selection), ownGames.filter(r => r.policy === champion.revision && r.endedAt >= selection));
    if (rollback.rollback) {
      const previous = { revision: `${champion.revision}-rollback`, generation: champion.generation, selectedAt: new Date().toISOString(), policy: champion.previous.policy,
        rollbackOf: champion.revision, evidence: rollback };
      writeFileSync('.run/champion.json.tmp', JSON.stringify(previous, null, 2)); renameSync('.run/champion.json.tmp', '.run/champion.json');
      record('rolled_back', previous); record('cycle_finished', { promoted: false, rolledBack: true }); return;
    }
  }
  const current = validatePolicy(champion.policy);
  const trainingLosses = ownGames.filter(r => r.rank > 1 && trainingIds.has(r.id));
  const selfLosses = trainingLosses.map(r => ({ endingBalance: r.endingBalance, leftoverScore: r.leftoverScore ?? 0 }));
  const generation = (champion.generation ?? 0) + 1;
  // New nonoverlapping seed blocks per completed evaluation cycle. Actual
  // match records are split before profiles/candidates are constructed.
  const previousRuns = existsSync('data/learning/evolution.jsonl') ? readFileSync('data/learning/evolution.jsonl', 'utf8').split('\n').filter(s => s.includes('"event":"cycle_finished"')).length : 0;
  const candidates = proposePolicies(current, history.leaders, split.train, selfLosses, previousRuns + 1);
  const seedBase = 30_000 + previousRuns * 1000;
  const trainingSeeds = Array.from({ length: 12 }, (_, i) => seedBase + i);
  if (split.holdout.some((m: { id: number }) => trainingIds.has(m.id))) throw new Error('Training/holdout overlap');
  writeFileSync('.run/learner-status.json', JSON.stringify({ pid: process.pid, time: new Date().toISOString(), phase: 'screening' }));
  const evaluate = async (policy: Policy, seeds: number[], profiles: typeof trainProfiles) => {
    const results = [];
    for (const seed of seeds) {
      results.push(simulate(dictionary, seed, true, 'observed', { policy, profiles, incumbent: current }));
      await new Promise(resolve => setImmediate(resolve));
    }
    return results;
  };
  const baselineTrain = await evaluate(current, trainingSeeds, trainProfiles);
  const screened = [];
  for (const candidate of candidates) {
    const results = await evaluate(candidate.policy, trainingSeeds, trainProfiles);
    const gain = average(results.map((r, i) => fitness(r) - fitness(baselineTrain[i])));
    record('candidate_screened', { name: candidate.name, gain, policy: candidate.policy });
    screened.push({ ...candidate, gain });
  }
  screened.sort((a, b) => b.gain - a.gain);
  const best = screened[0];
  let promoted = false;
  if (best && best.gain > 0) {
    writeFileSync('.run/learner-status.json', JSON.stringify({ pid: process.pid, time: new Date().toISOString(), phase: 'holdout', candidate: best.name }));
    const seeds = Array.from({ length: 20 }, (_, i) => seedBase + 200 + i);
    const baseline = await evaluate(current, seeds, holdoutProfiles);
    const challenger = await evaluate(best.policy, seeds, holdoutProfiles);
    const differences = challenger.map((r, i) => fitness(r) - fitness(baseline[i]));
    const gate = promotionGate(differences);
    // Keep the easy-opponent sanity check as well as the harder model-based
    // comparison. It cannot establish live superiority on its own.
    const sanity = [1, 2, 3, 4].every(seed => simulate(dictionary, 70_000 + seed, true, 'aggressive', { policy: best.policy }).rank <= 3);
    record('holdout_evaluated', { candidate: best.name, gate, sanity, baselineMeanScore: average(baseline.map(r => r.hero)),
      challengerMeanScore: average(challenger.map(r => r.hero)), baselineMeanRank: average(baseline.map(r => r.rank)),
      challengerMeanRank: average(challenger.map(r => r.rank)), trainingMatchIds: split.train.map((m: { id: number }) => m.id),
      holdoutMatchIds: split.holdout.map((m: { id: number }) => m.id), trainingLossMatchIds: trainingLosses.map(r => r.id), seeds, differences });
    if (gate.pass && sanity) {
      const next = { revision: `${POLICY_VERSION}-g${generation}`, generation, selectedAt: new Date().toISOString(), policy: best.policy,
        previous: { revision: champion.revision, policy: current }, evidence: { gate, candidate: best.name, modelAsOf: history.fetchedAt } };
      writeFileSync('.run/champion.json.tmp', JSON.stringify(next, null, 2)); renameSync('.run/champion.json.tmp', '.run/champion.json');
      writeFileSync(`data/learning/champion-g${generation}.json`, JSON.stringify(next, null, 2));
      record('promoted', { revision: next.revision, candidate: best.name }); promoted = true;
    }
  }
  record('cycle_finished', { promoted, champion: promoted ? `${POLICY_VERSION}-g${generation}` : champion.revision,
    models: history.leaders.map((b: { name: string }) => b.name) });
  writeFileSync('.run/learner-status.json', JSON.stringify({ pid: process.pid, time: new Date().toISOString(), phase: 'idle', lastCycleAt: new Date().toISOString() }));
}
async function run() {
  try { await cycle(); } catch (error) {
    record('cycle_error', { error: String(error) });
    writeFileSync('.run/learner-status.json', JSON.stringify({ pid: process.pid, time: new Date().toISOString(), phase: 'error', error: String(error) }));
  }
  if (!process.argv.includes('--once')) {
    const status = JSON.parse(readFileSync('.run/learner-status.json', 'utf8'));
    writeFileSync('.run/learner-status.json', JSON.stringify({ ...status, nextCycleAt: new Date(Date.now() + 15 * 60_000).toISOString() }));
    setTimeout(() => void run(), 15 * 60_000);
  }
}
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
await run();
