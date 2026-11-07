import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { normalizeMatch, option, queries, rankBots, sql, validateMatch, type HistoricalMatch } from '../src/history.js';
import { BOT_ID } from '../src/config.js';

mkdirSync('data/learning', { recursive: true });
mkdirSync('data/learning/matches', { recursive: true });
const [bots, stats, versions] = await Promise.all([sql('SELECT * FROM bot'), sql('SELECT * FROM bot_stats'), sql('SELECT * FROM bot_version')]);
const leaders = rankBots(bots, stats, versions).slice(0, 3);
const previous = existsSync('data/learning/history.json') ? JSON.parse(readFileSync('data/learning/history.json', 'utf8')) : { matches: [] };
const existing = new Map<number, HistoricalMatch>(previous.matches.map((m: HistoricalMatch) => [m.id, m]));
const counts = Number(process.env.PROFILE_MATCHES ?? 40);
const newest = await Promise.all(leaders.map(async bot => {
  const rows = await sql(`SELECT * FROM match_participant WHERE bot_id = ${bot.botId}`);
  const sorted = rows.sort((a, b) => b.match_id - a.match_id);
  const recent = sorted.slice(0, counts + 3);
  // Stratify older history across the full archive, rather than selecting
  // only famous wins or one recent period. Rule/version checks happen below.
  const old = sorted.slice(counts + 3);
  const olderCount = Math.min(40, old.length);
  const older = Array.from({ length: olderCount }, (_, i) => old[Math.floor(i * old.length / olderCount)]);
  return [...recent, ...older].map(r => r.match_id as number);
}));
const ownHistory = await sql(`SELECT * FROM match_participant WHERE bot_id = ${BOT_ID}`);
const ids = [...new Set([...newest.flat(), ...ownHistory.map(r => r.match_id as number)])];
const pending = ids.filter(id => !existing.has(id));
const rejected: { id: number; errors: string[] }[] = [];
for (let start = 0; start < pending.length; start += 60) {
  const group = pending.slice(start, start + 60);
  const where = (column: string) => group.map(id => `${column} = ${id}`).join(' OR ');
  const [matches, participants, auctions, results, tops, plays] = await Promise.all([
    sql(`SELECT * FROM match_state WHERE ${where('id')}`),
    sql(`SELECT * FROM match_participant WHERE ${where('match_id')}`),
    sql(`SELECT * FROM auction WHERE ${where('match_id')}`),
    sql(`SELECT * FROM auction_result WHERE ${where('match_id')}`),
    // Only ended-match archives. Never read the spectator-only live bid view.
    sql(`SELECT * FROM auction_top_bid_archive WHERE ${where('match_id')}`),
    sql(`SELECT * FROM word_play WHERE ${where('match_id')}`),
  ]);
  for (const raw of matches) {
    if (raw.status[0] !== 2 || option(raw.ended_at) === undefined) continue;
    const inMatch = (r: Record<string, any>) => r.match_id === raw.id;
    const normalized = normalizeMatch(raw, participants.filter(inMatch), auctions.filter(inMatch), results.filter(inMatch), tops.filter(inMatch), plays.filter(inMatch));
    const errors = validateMatch(normalized);
    if (errors.length) rejected.push({ id: raw.id, errors });
    else {
      existing.set(raw.id, normalized);
      writeFileSync(`data/learning/matches/${normalized.id}.json`, JSON.stringify(normalized));
    }
  }
}
// Keep a bounded reservoir; recent leader matches plus reusable historical
// coverage for a leader such as Waupus that is not currently online.
const matches = [...existing.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 500);
mkdirSync('data/learning/self', { recursive: true });
for (const match of existing.values()) {
  const mine = match.participants.find(p => p.botId === Number(BOT_ID));
  const path = `data/learning/self/${match.id}.json`;
  if (!mine) continue;
  if (existsSync(path)) {
    const own = JSON.parse(readFileSync(path, 'utf8'));
    const missed = (own.bidTrace ?? []).filter((trace: Record<string, number>) => {
      const sale = match.auctions.find(a => a.id === trace.auctionId);
      return sale?.winner !== Number(BOT_ID) && sale?.topBid !== undefined && sale.topBid >= trace.bid && trace.cashGain >= 10;
    });
    writeFileSync(path, JSON.stringify({ ...own, ...match, expensiveCompletionsLost: missed, enrichedAt: new Date().toISOString() }));
    continue;
  }
  const rank = 1 + match.participants.filter(p => p.score > mine.score).length;
  const tilesBought = match.auctions.filter(a => a.winner === Number(BOT_ID)).length;
  writeFileSync(path, JSON.stringify({ ...match, botId: Number(BOT_ID), policy: 'historical', mixedPolicy: true,
    rank, score: mine.score, endingBalance: mine.balance, tilesBought, leftoverScore: null,
    flags: rank > 1 && mine.balance > 35 && tilesBought < match.auctions.length / 3 ? ['unused-budget-and-low-acquisition'] : [], qualityErrors: [] }));
}
const record = { fetchedAt: new Date().toISOString(), leaders, matches, rejected, queries };
writeFileSync('data/learning/history.json.tmp', JSON.stringify(record)); renameSync('data/learning/history.json.tmp', 'data/learning/history.json');
console.log(JSON.stringify({ leaders: leaders.map(b => ({ bot: b.botId, name: b.name, rating: b.rating })), validMatches: matches.length, rejected: rejected.length, downloaded: pending.length }));
