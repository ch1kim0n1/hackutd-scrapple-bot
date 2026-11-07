import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { option, sql, timestamp, type HistoricalMatch } from '../src/history.js';
import type { LiveDecision } from '../src/recording.js';

const bot = 166;
const [stats, versions, bots] = await Promise.all([
  sql(`SELECT * FROM bot_stats WHERE bot_id = ${bot}`), sql(`SELECT * FROM bot_version WHERE bot_id = ${bot}`), sql('SELECT id, name FROM bot'),
]);
const names = new Map(bots.map(b => [b.id, b.name]));
const lastPlayed = timestamp(option(stats[0].last_played));
const versionStart = Math.max(...versions.map(v => timestamp(v.started_at)));
const source = readdirSync('data/learning/self').filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(`data/learning/self/${f}`, 'utf8')))
  .filter(g => !g.qualityErrors?.length && g.endedAt <= lastPlayed).sort((a, b) => a.endedAt - b.endedAt);
const db = new DatabaseSync('data/training/games.sqlite', { readOnly: true });
const mean = (xs: number[]) => xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : 0;
function metrics(match: HistoricalMatch, id: number) {
  const own = match.participants.find(p => p.botId === id)!;
  const plays = match.plays.filter(p => p.botId === id), buys = match.auctions.filter(a => a.winner === id);
  const checkpoints = [20, 40, 50].map(round => {
    const at = match.auctions[round - 1]?.at ?? match.endedAt;
    const words = plays.filter(p => p.at <= at), purchases = buys.filter(a => a.at <= at);
    const score = words.reduce((s, p) => s + p.reward, 0);
    return { round, score, balance: 100 + score - purchases.reduce((s, a) => s + a.paid, 0),
      rackSize: match.rackSize + purchases.length - words.reduce((s, p) => s + p.word.length, 0) };
  });
  return { botId: id, name: names.get(id), score: own.score, balance: own.balance,
    rank: 1 + match.participants.filter(p => p.score > own.score).length,
    bought: buys.length, spent: buys.reduce((s, a) => s + a.paid, 0),
    words: plays.map(p => ({ word: p.word, reward: p.reward, round: match.auctions.filter(a => a.at <= p.at).length })),
    longWords: plays.filter(p => p.word.length >= 7).length, checkpoints,
    after40: own.score - checkpoints.find(c => c.round === 40)!.score };
}
const games = source.map(g => {
  const archived = db.prepare('SELECT normalized_gzip FROM games WHERE match_id=?').get(g.id);
  const match: HistoricalMatch = archived ? JSON.parse(gunzipSync(archived.normalized_gzip as Uint8Array).toString()) : g;
  const bestScore = Math.max(...match.participants.map(p => p.score));
  const mine = metrics(match, bot), winners = match.participants.filter(p => p.score === bestScore).map(p => metrics(match, p.botId));
  const journalPath = `data/training/live/${g.id}.jsonl`;
  const live: LiveDecision[] = existsSync(journalPath) ? readFileSync(journalPath, 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s)) : [];
  const stalled = live.filter(d => d.kind === 'word' && d.action.word === null && d.features.rack.reduce((a, b) => a + b, 0) >= 10 && d.features.remaining > 16);
  const missed = (g.bidTrace ?? []).flatMap((t: any) => {
    const sale = match.auctions.find(a => a.id === t.auctionId);
    if (!sale || sale.winner === bot || t.bid <= 0) return [];
    return [{ letter: sale.letter, bid: t.bid, paid: sale.paid, topBid: sale.topBid ?? null, cashGain: t.cashGain,
      balance: t.balance, rack: t.rack, remaining: t.remaining }];
  });
  const bids = live.filter(d => d.kind === 'bid');
  const endgameBids = bids.filter(d => d.features.remaining <= 16);
  return { id: g.id, endedAt: g.endedAt, policy: g.policy, mixedPolicy: g.mixedPolicy, version2: g.endedAt >= versionStart,
    ...mine, sharedFirst: mine.rank === 1 && winners.length > 1, winners,
    stallRounds: [...new Set(stalled.map(d => d.features.round))], missed,
    endgameAbstentions: endgameBids.filter(d => d.action.amount === 0).length, endgameDecisions: endgameBids.length,
    endgameStartingEmpty: endgameBids.some(d => d.features.remaining >= 12 && !d.features.rack.some(n => n)),
  };
});
function summarize(gs: typeof games) {
  return { games: gs.length, wins: gs.filter(g => g.rank === 1).length,
    soloWins: gs.filter(g => g.rank === 1 && !g.sharedFirst).length, sharedWins: gs.filter(g => g.sharedFirst).length,
    meanScore: mean(gs.map(g => g.score)), meanRank: mean(gs.map(g => g.rank)),
    meanBalance: mean(gs.map(g => g.balance)), meanBought: mean(gs.map(g => g.bought)),
    meanLongWords: mean(gs.map(g => g.longWords)), meanAfter40: mean(gs.map(g => g.after40)),
    winnerMeanScore: mean(gs.map(g => g.winners[0].score)), winnerMeanBought: mean(gs.map(g => mean(g.winners.map(w => w.bought)))),
    winnerMeanLongWords: mean(gs.map(g => mean(g.winners.map(w => w.longWords)))) };
}
const byPolicy = Object.fromEntries([...new Set(games.map(g => g.policy))].map(p => [p, summarize(games.filter(g => g.policy === p && !g.mixedPolicy))]));
const output = { asOf: new Date().toISOString(), server: stats[0], versions, lastPlayed, versionStart,
  allArchived: summarize(games), version2: summarize(games.filter(g => g.version2)), byPolicy,
  learner: JSON.parse(readFileSync('.run/learner-status.json', 'utf8')),
  latest: games.slice(-12), sources: ['public bot_stats/bot_version SQL', 'validated self archives', 'public training database', 'live private decision journals'] };
db.close();
writeFileSync('data/learning/current-outcome.json', JSON.stringify(output, null, 2));
console.log(JSON.stringify({ ...output, latest: output.latest.map(g => ({ ...g, missed: g.missed.length, winners: g.winners.map(w => ({ bot: w.name, score: w.score, bought: w.bought, longWords: w.longWords })) })) }, null, 2));
