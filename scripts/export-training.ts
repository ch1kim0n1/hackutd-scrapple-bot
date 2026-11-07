import { mkdirSync, writeFileSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { setPriority } from 'node:os';
import { TrainingStore, unpack } from '../src/training-store.js';
import { chronologicalSplits, DATASET_SCHEMA, FEATURE_NAMES, type TrainingExample } from '../src/training.js';

const store = new TrainingStore();
const privateOnly = process.argv.includes('--private');
try { setPriority(0, 10); } catch {}
// A WAL read transaction freezes this snapshot while the collector keeps
// appending games. It does not block the live recorder or archive writer.
store.db.exec('BEGIN');
const output = process.env.DATASET_EXPORT_DIR ?? `data/training/exports/${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(output, { recursive: true });
const rows = store.db.prepare(`SELECT match_id AS id, ended_at AS endedAt, content_hash AS hash FROM games
  WHERE quality='valid' ${privateOnly ? 'AND own_examples > 0' : ''} ORDER BY ended_at, match_id`).all();
const split = chronologicalSplits(rows.map(r => ({ id: Number(r.id), endedAt: Number(r.endedAt) })));
const manifest: Record<string, any> = { schemaVersion: DATASET_SCHEMA, createdAt: new Date().toISOString(), source: 'games.sqlite',
  scope: privateOnly ? 'exact_private_decisions' : 'all_valid_examples',
  splitRule: 'chronological 80/10/10 by completed match; whole games remain together; snapshot membership fixed below',
  featureNames: FEATURE_NAMES, counts: {}, matches: rows.map(r => ({ ...r, split: split.get(Number(r.id)) })), shards: [] };
try {
  for (const partition of ['train', 'validation', 'test'] as const) {
    let shard = 0, shardRows = 0, total = 0;
    let stream: ReturnType<typeof createGzip> | undefined, destination: ReturnType<typeof createWriteStream> | undefined;
    let file = '', hash = createHash('sha256');
    const finish = async () => {
      if (!stream || !destination) return;
      const done = once(destination, 'finish'); stream.end(); await done;
      manifest.shards.push({ file, split: partition, examples: shardRows, uncompressedSha256: hash.digest('hex') });
    };
    for (const row of rows.filter(r => split.get(Number(r.id)) === partition)) {
      const current = store.db.prepare("SELECT content_hash, examples_gzip FROM games WHERE match_id=? AND quality='valid'").get(row.id);
      if (!current || current.content_hash !== row.hash) throw new Error(`Game ${row.id} changed during export; retry a new snapshot`);
      const examples = unpack<TrainingExample[]>(current.examples_gzip as Uint8Array).filter(e => !privateOnly || e.kind.startsWith('own'));
      // Rotate only between games, so no match straddles shards or splits.
      if (!stream || shardRows >= 50_000) {
        await finish(); file = `${partition}-${String(shard++).padStart(5, '0')}.jsonl.gz`;
        destination = createWriteStream(`${output}/${file}`, { flags: 'wx' });
        stream = createGzip({ level: 3 }); stream.pipe(destination); hash = createHash('sha256'); shardRows = 0;
      }
      for (const example of examples) {
        const line = JSON.stringify(example) + '\n'; hash.update(line);
        if (!stream!.write(line)) await once(stream!, 'drain');
        shardRows++; total++;
      }
    }
    await finish(); manifest.counts[partition] = total;
  }
  writeFileSync(`${output}/manifest.json`, JSON.stringify(manifest, null, 2));
  writeFileSync(privateOnly ? 'data/training/latest-private-export.json' : 'data/training/latest-export.json', JSON.stringify({ output, counts: manifest.counts, games: rows.length }, null, 2));
  store.db.exec('COMMIT');
  console.log(JSON.stringify({ output, games: rows.length, counts: manifest.counts }));
} finally { store.close(); }
