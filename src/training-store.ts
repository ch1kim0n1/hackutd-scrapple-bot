import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { validateMatch, type HistoricalMatch } from './history.js';
import { buildExamples, DATASET_SCHEMA, FEATURE_NAMES, type TrainingExample } from './training.js';
import type { LiveDecision } from './recording.js';
import { BOT_ID } from './config.js';

export const TRAINING_DB = 'data/training/games.sqlite';
export const pack = (value: unknown) => gzipSync(JSON.stringify(value), { level: 3 });
export const unpack = <T>(value: Uint8Array): T => JSON.parse(gunzipSync(value).toString());
export class TrainingStore {
  readonly db: DatabaseSync;
  constructor(path = TRAINING_DB) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS catalog (match_id INTEGER PRIMARY KEY, created_at REAL NOT NULL, ended_at REAL, status INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS fetch_failures (match_id INTEGER PRIMARY KEY, attempts INTEGER NOT NULL, retry_after REAL NOT NULL, error TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS games (
        match_id INTEGER PRIMARY KEY, created_at REAL NOT NULL, ended_at REAL NOT NULL,
        quality TEXT NOT NULL, errors_json TEXT NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL,
        content_hash TEXT NOT NULL, normalized_gzip BLOB NOT NULL, raw_gzip BLOB,
        examples_gzip BLOB NOT NULL, public_examples INTEGER NOT NULL, own_examples INTEGER NOT NULL,
        legacy_examples INTEGER NOT NULL, has_own_participant INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS games_ended ON games(ended_at, match_id);`);
    const schema = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get('schema_version')?.value;
    if (schema !== undefined && Number(schema) !== DATASET_SCHEMA) throw new Error('Dataset schema version mismatch');
    this.db.prepare('INSERT OR IGNORE INTO metadata VALUES (?, ?)').run('schema_version', String(DATASET_SCHEMA));
    this.db.prepare('INSERT OR IGNORE INTO metadata VALUES (?, ?)').run('feature_names', JSON.stringify(FEATURE_NAMES));
  }
  ingest(input: HistoricalMatch, own?: Record<string, any>, live: LiveDecision[] = [], raw?: unknown): boolean {
    const old = this.db.prepare('SELECT content_hash, raw_gzip, normalized_gzip FROM games WHERE match_id = ?').get(input.id);
    // Local files may lack post-match bid enrichment. Never replace a richer
    // downloaded public archive with a poorer local copy of the same game.
    const match = old?.raw_gzip && raw === undefined ? unpack<HistoricalMatch>(old.normalized_gzip as Uint8Array) : input;
    const hash = createHash('sha256').update(JSON.stringify({ match, live, bidTrace: own?.bidTrace ?? [] })).digest('hex');
    if (old?.content_hash === hash && (raw === undefined || old.raw_gzip)) return false;
    const errors = validateMatch(match);
    let examples: TrainingExample[] = [];
    if (!errors.length) {
      examples = buildExamples(match, live, own);
      if (examples.some(e => e.x.length !== FEATURE_NAMES.length || e.x.some(x => !Number.isFinite(x)))) errors.push('invalid feature vector');
    }
    if (errors.length) examples = [];
    this.db.prepare(`INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET created_at=excluded.created_at, ended_at=excluded.ended_at,
      quality=excluded.quality, errors_json=excluded.errors_json, source=excluded.source, updated_at=excluded.updated_at,
      content_hash=excluded.content_hash, normalized_gzip=excluded.normalized_gzip,
      raw_gzip=COALESCE(excluded.raw_gzip, games.raw_gzip), examples_gzip=excluded.examples_gzip,
      public_examples=excluded.public_examples, own_examples=excluded.own_examples, legacy_examples=excluded.legacy_examples,
      has_own_participant=excluded.has_own_participant`).run(
        match.id, match.createdAt, match.endedAt, errors.length ? 'quarantined' : 'valid', JSON.stringify(errors),
        raw !== undefined || old?.raw_gzip ? 'public_sql_archive' : 'local_game_archive', new Date().toISOString(), hash,
        pack(match), raw === undefined ? null : pack(raw), pack(examples),
        examples.filter(e => e.kind.startsWith('public')).length,
        examples.filter(e => e.kind.startsWith('own')).length,
        examples.filter(e => e.kind === 'legacy_own_bid').length,
        Number(!!own || live.length > 0 || match.participants.some(p => p.botId === Number(BOT_ID))));
    return true;
  }
  stats() {
    const counts = this.db.prepare(`SELECT COUNT(*) AS games, SUM(quality='valid') AS validGames,
      SUM(quality='quarantined') AS quarantinedGames, SUM(public_examples) AS publicExamples,
      SUM(own_examples) AS ownExamples, SUM(legacy_examples) AS legacyExamples,
      SUM(has_own_participant) AS ownGames, SUM(raw_gzip IS NOT NULL) AS fullPublicArchives FROM games`).get();
    const remote = this.db.prepare('SELECT COUNT(*) AS discovered, SUM(status=2 AND ended_at IS NOT NULL) AS completed FROM catalog').get();
    const failed = this.db.prepare('SELECT COUNT(*) AS temporarilyUnavailable FROM fetch_failures').get();
    return { ...counts, ...remote, ...failed };
  }
  close() { this.db.close(); }
}
