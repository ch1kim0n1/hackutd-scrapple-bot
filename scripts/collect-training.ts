import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { setPriority } from 'node:os';
import { normalizeMatch, option, sql, timestamp, type HistoricalMatch, type Raw } from '../src/history.js';
import type { LiveDecision } from '../src/recording.js';
import { TrainingStore } from '../src/training-store.js';

try { setPriority(0, 10); } catch {}
mkdirSync('.run', { recursive: true }); mkdirSync('logs', { recursive: true }); mkdirSync('data/training/live', { recursive: true });
const lockPath = '.run/dataset.lock';
if (existsSync(lockPath)) {
  const old = Number(readFileSync(lockPath, 'utf8'));
  let alive = false; try { process.kill(old, 0); alive = true; } catch {}
  if (alive) throw new Error(`Dataset collector already running as ${old}`);
  unlinkSync(lockPath);
}
const lock = openSync(lockPath, 'wx'); writeFileSync(lock, String(process.pid));
const store = new TrainingStore();
let stopping = false, batches = 0;
const localTimes = new Map<string, number>();
const record = (event: string, details: Record<string, unknown> = {}) => {
  const row = JSON.stringify({ time: new Date().toISOString(), event, ...details });
  console.log(row); appendFileSync('data/training/collection.jsonl', row + '\n');
};
function status(phase: string, extra = {}) {
  writeFileSync('.run/dataset-status.json.tmp', JSON.stringify({ pid: process.pid, time: new Date().toISOString(), phase, batches, ...store.stats(), ...extra }));
  renameSync('.run/dataset-status.json.tmp', '.run/dataset-status.json');
}
function supplemental(id: number) {
  const ownPath = `data/learning/self/${id}.json`, livePath = `data/training/live/${id}.jsonl`;
  const own = existsSync(ownPath) ? JSON.parse(readFileSync(ownPath, 'utf8')) : undefined;
  const live: LiveDecision[] = [];
  if (existsSync(livePath)) for (const line of readFileSync(livePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { live.push(JSON.parse(line)); } catch { record('invalid_journal_line', { matchId: id }); }
  }
  return { own, live };
}
function importLocal() {
  for (const directory of ['data/learning/matches', 'data/learning/self']) {
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory).filter(f => /^\d+\.json$/.test(f))) {
      const path = `${directory}/${file}`, id = Number(file.slice(0, -5));
      const livePath = `data/training/live/${id}.jsonl`;
      const modified = statSync(path).mtimeMs + (existsSync(livePath) ? statSync(livePath).mtimeMs : 0);
      if (localTimes.get(path) === modified) continue;
      const match: HistoricalMatch = JSON.parse(readFileSync(path, 'utf8'));
      if (!match.endedAt) continue;
      const { own, live } = supplemental(id);
      store.ingest(match, own, live); localTimes.set(path, modified);
    }
  }
}
async function discover() {
  const rows = await sql('SELECT id, created_at, ended_at, status FROM match_state');
  const insert = store.db.prepare('INSERT OR REPLACE INTO catalog VALUES (?, ?, ?, ?)');
  store.db.exec('BEGIN');
  try {
    for (const r of rows) insert.run(r.id, timestamp(r.created_at), option(r.ended_at) === undefined ? null : timestamp(option(r.ended_at)), r.status[0]);
    store.db.exec('COMMIT');
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
  record('catalog_refreshed', { rows: rows.length });
}
async function fetchBatch(ids: number[]) {
  // Bounded ranges use the server's match indexes. A long OR expression
  // took roughly 25s/batch; the same auction range took about 4s locally.
  const where = (column: string) => `${column} >= ${Math.min(...ids)} AND ${column} <= ${Math.max(...ids)}`;
  const requested = new Set(ids), found = new Set<number>();
  const queriesToRun = [
    `SELECT * FROM match_state WHERE ${where('id')}`,
    `SELECT * FROM match_participant WHERE ${where('match_id')}`,
    `SELECT * FROM auction WHERE ${where('match_id')}`,
    `SELECT * FROM auction_result WHERE ${where('match_id')}`,
    // IDs come exclusively from completed catalog rows. Live hidden bids
    // and other players' private racks are never queried.
    `SELECT * FROM auction_top_bid_archive WHERE ${where('match_id')}`,
    `SELECT * FROM word_play WHERE ${where('match_id')}`,
  ];
  const tablesFetched: Raw[][] = [];
  // Pace archival reads on the shared game server; at most two SQL requests
  // run concurrently, independently of the live bot's connection.
  for (let i = 0; i < queriesToRun.length; i += 2) tablesFetched.push(...await Promise.all(queriesToRun.slice(i, i + 2).map(q => sql(q))));
  const [matches, participants, auctions, results, tops, plays] = tablesFetched;
  const grouped = (rows: Raw[]) => {
    const groups = new Map<number, Raw[]>();
    for (const r of rows) { const list = groups.get(r.match_id) ?? []; list.push(r); groups.set(r.match_id, list); }
    return groups;
  };
  const maps = [participants, auctions, results, tops, plays].map(grouped);
  for (const raw of matches) {
    if (!requested.has(raw.id)) continue;
    if (raw.status[0] !== 2 || option(raw.ended_at) === undefined) continue;
    found.add(raw.id);
    const tables = maps.map(m => m.get(raw.id) ?? []);
    const normalized = normalizeMatch(raw, tables[0], tables[1], tables[2], tables[3], tables[4]);
    const { own, live } = supplemental(raw.id);
    store.ingest(normalized, own, live, { match: raw, participants: tables[0], auctions: tables[1], results: tables[2], topBids: tables[3], wordPlays: tables[4] });
    store.db.prepare('DELETE FROM fetch_failures WHERE match_id=?').run(raw.id);
  }
  for (const id of ids.filter(id => !found.has(id))) {
    store.db.prepare(`INSERT INTO fetch_failures VALUES (?, 1, ?, 'catalog row missing or no longer complete')
      ON CONFLICT(match_id) DO UPDATE SET attempts=attempts+1, retry_after=excluded.retry_after, error=excluded.error`).run(id, Date.now() + 60 * 60_000);
    record('match_temporarily_unavailable', { matchId: id });
  }
  // Query provenance is retained without credentials or unbounded memory.
  const { queries } = await import('../src/history.js');
  appendFileSync('data/training/queries.jsonl', queries.splice(0).map(q => JSON.stringify(q)).join('\n') + '\n');
  batches++; status('backfilling');
  record('batch_archived', { first: ids[0], last: ids.at(-1), count: ids.length, ...store.stats() });
}
async function cycle() {
  status('importing_local'); importLocal(); status('discovering'); await discover();
  let cycleBatches = 0;
  while (!stopping) {
    importLocal();
    const pending = store.db.prepare(`SELECT c.match_id FROM catalog c LEFT JOIN games g ON g.match_id=c.match_id
      LEFT JOIN fetch_failures f ON f.match_id=c.match_id
      WHERE c.status=2 AND c.ended_at IS NOT NULL AND (g.match_id IS NULL OR g.raw_gzip IS NULL)
      AND (f.match_id IS NULL OR f.retry_after < ?)
      ORDER BY c.match_id DESC LIMIT ?`).all(Date.now(), Number(process.env.DATASET_BATCH_SIZE ?? 100)).map(r => Number(r.match_id));
    if (!pending.length) break;
    // Bound the range across gaps/deleted match IDs as well as row count.
    await fetchBatch(pending.filter(id => id >= pending[0] - 500)); cycleBatches++;
    if (process.env.DATASET_BATCHES && cycleBatches >= Number(process.env.DATASET_BATCHES)) break;
    if (cycleBatches % 10 === 0) await discover();
    for (let i = 0; i < 3 && !stopping; i++) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const pending = store.db.prepare(`SELECT COUNT(*) AS n FROM catalog c LEFT JOIN games g ON g.match_id=c.match_id
    WHERE c.status=2 AND c.ended_at IS NOT NULL AND (g.match_id IS NULL OR g.raw_gzip IS NULL)`).get()!;
  status(Number(pending.n) ? 'backfill_remaining' : 'caught_up'); record('cycle_finished', { ...store.stats(), remainingPublicArchives: pending.n });
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; });
try {
  do {
    try { await cycle(); } catch (error) {
      record('collection_error', { error: String(error) }); status('error', { error: String(error) });
      if (process.argv.includes('--once')) process.exitCode = 1;
    }
    if (process.argv.includes('--once') || stopping) break;
    // Refresh completed games and local journals frequently once caught up.
    status('waiting', { nextCheckAt: new Date(Date.now() + 30_000).toISOString() });
    for (let i = 0; i < 30 && !stopping; i++) await new Promise(resolve => setTimeout(resolve, 1000));
  } while (!stopping);
} finally {
  status('stopped'); store.close(); unlinkSync(lockPath);
}
