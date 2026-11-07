import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
mkdirSync('.run', { recursive: true }); mkdirSync('logs', { recursive: true });
const learner = process.argv.includes('--learner');
const dataset = process.argv.includes('--dataset');
const name = dataset ? 'Dataset collector' : learner ? 'Learner' : 'Bot';
const entry = dataset ? 'scripts/collect-training.ts' : learner ? 'scripts/evolve.ts' : 'src/main.ts';
const statusPath = dataset ? '.run/dataset-status.json' : learner ? '.run/learner-status.json' : '.run/status.json';
if (existsSync(statusPath)) {
  const current = JSON.parse(readFileSync(statusPath, 'utf8'));
  let command = '';
  try { command = execFileSync('ps', ['-p', String(current.pid), '-o', 'command='], { encoding: 'utf8' }); } catch {}
  if (command.includes(resolve(entry)) || command.includes(resolve('node_modules/tsx')) && command.endsWith(`${entry}\n`)) {
    console.log(`${name} already running as process ${current.pid}.`); process.exit(0);
  }
}
const output = openSync(dataset ? 'logs/dataset.log' : learner ? 'logs/learner.log' : 'logs/runtime.log', 'a', 0o600);
const child = spawn(process.execPath, ['--import', 'tsx', resolve(entry)], {
  cwd: process.cwd(), detached: true, stdio: ['ignore', output, output], env: process.env,
});
child.unref();
writeFileSync(dataset ? '.run/dataset-launcher.json' : learner ? '.run/learner-launcher.json' : '.run/launcher.json', JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString() }));
console.log(`Started ${name.toLowerCase()} as process ${child.pid}.`);
