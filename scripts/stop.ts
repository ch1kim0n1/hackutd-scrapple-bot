import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const learner = process.argv.includes('--learner');
const dataset = process.argv.includes('--dataset');
const entry = dataset ? 'scripts/collect-training.ts' : learner ? 'scripts/evolve.ts' : 'src/main.ts';
const statusPath = dataset ? '.run/dataset-status.json' : learner ? '.run/learner-status.json' : '.run/status.json';
if (!existsSync(statusPath)) { console.log('No process status found.'); process.exit(0); }
const status = JSON.parse(readFileSync(statusPath, 'utf8'));
let command = '';
try { command = execFileSync('ps', ['-p', String(status.pid), '-o', 'command='], { encoding: 'utf8' }); } catch {}
const relativeEntry = command.includes(resolve('node_modules/tsx')) && command.trimEnd().endsWith(` ${entry}`);
if (!command.includes(resolve(entry)) && !relativeEntry) {
  console.log('The recorded bot process is no longer running.'); process.exit(0);
}
process.kill(status.pid, 'SIGTERM');
let running = true;
for (let attempt = 0; attempt < (dataset ? 300 : 50); attempt++) {
  await new Promise(resolve => setTimeout(resolve, 100));
  try { process.kill(status.pid, 0); } catch { running = false; break; }
}
if (running) {
  let stillOurs = '';
  try { stillOurs = execFileSync('ps', ['-p', String(status.pid), '-o', 'command='], { encoding: 'utf8' }); } catch {}
  if (stillOurs.includes(resolve(entry)) || stillOurs.includes(resolve('node_modules/tsx')) && stillOurs.trimEnd().endsWith(` ${entry}`)) process.kill(status.pid, 'SIGKILL');
}
console.log(`Stopped ${dataset ? 'dataset collector' : learner ? 'learner' : 'bot'} process ${status.pid}.`);
