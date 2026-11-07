import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { BOT_ID, DATABASE, HOST } from './config.js';
import { sql } from './history.js';

export interface VersionPlan { target: number; winsRequired: number; armedAt: number; state: 'armed' | 'done'; completedAt?: string; qualifyingMatches?: number[]; serverVersion?: number }
export function qualifyingWins(plan: VersionPlan, games: { id: number; endedAt: number; rank: number; qualityErrors?: string[] }[]): number[] {
  return [...new Set(games.filter(g => g.endedAt >= plan.armedAt && g.rank === 1 && !g.qualityErrors?.length).map(g => g.id))];
}
const execute = promisify(execFile);
let checking = false;
export async function maybeStartRequestedVersion(): Promise<Record<string, unknown> | undefined> {
  const path = '.run/version-plan.json';
  if (checking || !existsSync(path)) return;
  const plan: VersionPlan = JSON.parse(readFileSync(path, 'utf8'));
  if (plan.state === 'done') return;
  const games = existsSync('data/learning/self') ? readdirSync('data/learning/self').filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(`data/learning/self/${f}`, 'utf8'))) : [];
  const wins = qualifyingWins(plan, games);
  if (wins.length < plan.winsRequired) return;
  checking = true;
  try {
    const team = await sql('SELECT * FROM my_team');
    if (team[0]?.bot_id !== Number(BOT_ID)) throw new Error('CLI identity does not own the expected bot');
    const versions = await sql(`SELECT * FROM bot_version WHERE bot_id = ${BOT_ID}`);
    let current = Math.max(1, ...versions.map(v => v.version));
    if (current < plan.target) {
      if (current + 1 !== plan.target) throw new Error('Unexpected version gap; refusing multiple resets');
      await execute(process.env.SPACETIME_CLI ?? `${homedir()}/.local/bin/spacetime`,
        ['call', '--server', HOST, DATABASE, 'start_new_bot_version'], { timeout: 30_000 });
      const fresh = await sql(`SELECT * FROM bot_version WHERE bot_id = ${BOT_ID}`);
      current = Math.max(1, ...fresh.map(v => v.version));
      if (current < plan.target) throw new Error('Version reset was not verified');
    }
    const done: VersionPlan = { ...plan, state: 'done', completedAt: new Date().toISOString(), qualifyingMatches: wins, serverVersion: current };
    writeFileSync(path + '.tmp', JSON.stringify(done, null, 2)); renameSync(path + '.tmp', path);
    return { event: 'website_version_started', target: plan.target, version: current, qualifyingMatches: wins };
  } finally { checking = false; }
}
