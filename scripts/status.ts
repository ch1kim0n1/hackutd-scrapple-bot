import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { qualifyingWins } from '../src/versioning.js';
if (!existsSync('.run/status.json')) { console.log('No runtime status yet.'); process.exit(0); }
const status = JSON.parse(readFileSync('.run/status.json', 'utf8'));
let alive = false;
try { process.kill(status.pid, 0); alive = true; } catch {}
console.log(JSON.stringify({ ...status, processAlive: alive, stale: Date.now() - Date.parse(status.time) > 5000 }, null, 2));
if (existsSync('.run/learner-status.json')) {
  const learner = JSON.parse(readFileSync('.run/learner-status.json', 'utf8'));
  let alive = false; try { process.kill(learner.pid, 0); alive = true; } catch {}
  console.log(JSON.stringify({ learner: { ...learner, processAlive: alive } }, null, 2));
}
if (existsSync('.run/version-plan.json')) {
  const plan = JSON.parse(readFileSync('.run/version-plan.json', 'utf8'));
  const games = existsSync('data/learning/self') ? readdirSync('data/learning/self').filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(`data/learning/self/${f}`, 'utf8'))) : [];
  console.log(JSON.stringify({ websiteVersionPlan: { target: plan.target, state: plan.state, wins: qualifyingWins(plan, games).length, required: plan.winsRequired } }, null, 2));
}
if (existsSync('.run/dataset-status.json')) {
  const dataset = JSON.parse(readFileSync('.run/dataset-status.json', 'utf8'));
  let alive = false; try { process.kill(dataset.pid, 0); alive = true; } catch {}
  console.log(JSON.stringify({ dataset: { ...dataset, processAlive: alive } }, null, 2));
}
