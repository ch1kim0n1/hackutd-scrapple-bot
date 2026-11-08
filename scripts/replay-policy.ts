import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { BOT_ID } from '../src/config.js';
import { loadDictionary } from '../src/dictionary.js';
import type { HistoricalMatch } from '../src/history.js';
import { BAG, rackFrom, subtract, wordScore, type Rack } from '../src/letters.js';
import type { OpponentProfile } from '../src/opponents.js';
import { DEFAULT_POLICY, Strategy, V11_POLICY, V5_POLICY, validatePolicy, type GameContext, type Policy } from '../src/strategy.js';
import { TRAINING_DB } from '../src/training-store.js';

type OwnMatch = HistoricalMatch & {
  policy?: string;
  bidTrace?: { auctionId: number; rack: string }[];
};
type ReplayResult = { matchId: number; score: number; rank: number; win: boolean; bought: number; late: number; balance: number; ties: number };

const dictionary = loadDictionary();
const ownBotId = Number(BOT_ID);
const profileObservations = Number(process.env.PROFILE_OBS ?? 200);
const profiles = existsSync('data/learning/profiles.json') && profileObservations
  ? ((JSON.parse(readFileSync('data/learning/profiles.json', 'utf8')).profiles ?? []) as OpponentProfile[])
    .map(profile => ({ ...profile, bidObservations: profile.bidObservations.slice(0, profileObservations) }))
  : [];
const variants: Record<string, Policy> = {
  v6: validatePolicy({ ...V5_POLICY, reserveFraction: 0.3, spendDown: 1 }),
  v8: validatePolicy({ ...DEFAULT_POLICY, wordBank: 0, targetStrike: 0, inventoryBuild: 0, fragmentHoldUntil: 12, lateSpendGainCap: 0, upgradeHold: 0, leaveAware: 0, deadEndGuard: 0, premiumPath: 0, midShift: 0, lateFloor: 0, finalWord: 0, portfolio: 0, midQuota: 0, secondReserve: 0, lateTarget: 0, opponentCap: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0 }),
  v9b: validatePolicy({ ...DEFAULT_POLICY, mediumBankUntil: 0, targetStrike: 0, inventoryBuild: 0, fragmentHoldUntil: 12, lateSpendGainCap: 0, upgradeHold: 0, leaveAware: 0, deadEndGuard: 0, premiumPath: 0, midShift: 0, lateFloor: 0, finalWord: 0, portfolio: 0, midQuota: 0, secondReserve: 0, lateTarget: 0, opponentCap: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0 }),
  v9c: validatePolicy({ ...DEFAULT_POLICY, targetStrike: 0, inventoryBuild: 0, fragmentHoldUntil: 12, lateSpendGainCap: 0, upgradeHold: 0, leaveAware: 0, deadEndGuard: 0, premiumPath: 0, midShift: 0, lateFloor: 0, finalWord: 0, portfolio: 0, midQuota: 0, secondReserve: 0, lateTarget: 0, opponentCap: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0 }),
  v10: validatePolicy({ ...DEFAULT_POLICY, upgradeHold: 0, leaveAware: 0, deadEndGuard: 0, premiumPath: 0, midShift: 0, lateFloor: 0, finalWord: 0, portfolio: 0, midQuota: 0, secondReserve: 0, lateTarget: 0, opponentCap: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0 }),
  v10a: validatePolicy({ ...DEFAULT_POLICY, leaveAware: 0, deadEndGuard: 0, premiumPath: 0, midShift: 0, lateFloor: 0, finalWord: 0, portfolio: 0, midQuota: 0, secondReserve: 0, lateTarget: 0, opponentCap: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0 }),
  v11: V11_POLICY,
  v11b: validatePolicy({ ...DEFAULT_POLICY, portfolio: 0, midQuota: 0, secondReserve: 0, lateTarget: 0, opponentCap: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0 }),
  v12: validatePolicy({ ...DEFAULT_POLICY, ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0 }),
  v12a: validatePolicy({ ...DEFAULT_POLICY, opponentCap: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0 }),
  v12b: validatePolicy({ ...DEFAULT_POLICY, secondReserve: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0 }),
  v12c: validatePolicy({ ...DEFAULT_POLICY, lucent: 0 }),
  v12d: validatePolicy({ ...DEFAULT_POLICY, lateTarget: 0, lucent: 0 }),
  v12e: validatePolicy({ ...DEFAULT_POLICY, portfolio: 0, lucent: 0 }),
  v12f: validatePolicy({ ...DEFAULT_POLICY, midQuota: 0, lucent: 0 }),
  v13a: validatePolicy({ ...DEFAULT_POLICY, lucent: 1 }),
  v13b: validatePolicy({ ...DEFAULT_POLICY, lucent: 2 }),
  v13c: validatePolicy({ ...DEFAULT_POLICY, lucent: 3 }),
  v13d: validatePolicy({ ...DEFAULT_POLICY, lucent: 4 }),
  v13e: validatePolicy({ ...DEFAULT_POLICY, lucent: 5 }),
  v13f: validatePolicy({ ...DEFAULT_POLICY, lucent: 6 }),
  v13g: validatePolicy({ ...DEFAULT_POLICY, lucent: 7 }),
  v13h: validatePolicy({ ...DEFAULT_POLICY, lucent: 8 }),
  v13i: validatePolicy({ ...DEFAULT_POLICY, lucent: 9 }),
  v13j: validatePolicy({ ...DEFAULT_POLICY, lucent: 10 }),
  v13k: validatePolicy({ ...DEFAULT_POLICY, lucent: 11 }),
  v14a: validatePolicy({ ...DEFAULT_POLICY, lucent: 0, winner: 1 }),
  v14b: validatePolicy({ ...DEFAULT_POLICY, lucent: 0, winner: 2 }),
  v14c: validatePolicy({ ...DEFAULT_POLICY, lucent: 0, winner: 3 }),
  v14d: validatePolicy({ ...DEFAULT_POLICY, lucent: 1, winner: 1 }),
  v14e: validatePolicy({ ...DEFAULT_POLICY, lucent: 1, winner: 2 }),
  v14f: validatePolicy({ ...DEFAULT_POLICY, lucent: 1, winner: 3 }),
  v14g: validatePolicy({ ...DEFAULT_POLICY, lucent: 0, winner: 4 }),
  v14h: validatePolicy({ ...DEFAULT_POLICY, lucent: 0, winner: 5 }),
  v15: validatePolicy({ ...DEFAULT_POLICY, lucent: 1, winner: 6 }),
};
if (process.env.POLICY_JSON) variants.custom = validatePolicy(JSON.parse(process.env.POLICY_JSON));
const selected = (process.env.POLICIES?.split(',').map(name => name.trim()).filter(Boolean) ?? Object.keys(variants))
  .map(name => [name, variants[name]] as const);
const missing = selected.filter(([, policy]) => !policy).map(([name]) => name);
if (missing.length) throw new Error(`Unknown policy ${missing.join(', ')}. Available: ${Object.keys(variants).join(', ')}`);
const policies = selected as [string, Policy][];

const db = new DatabaseSync(TRAINING_DB);
const fullMatch = db.prepare('SELECT normalized_gzip FROM games WHERE match_id = ?');
const ids = process.env.MATCHES ? new Set(process.env.MATCHES.split(',').map(Number)) : undefined;
const limit = process.env.GAMES ? Number(process.env.GAMES) : undefined;
const own: [OwnMatch, HistoricalMatch][] = [];
for (const file of readdirSync('data/learning/self').filter(file => file.endsWith('.json'))) {
  const match = JSON.parse(readFileSync(`data/learning/self/${file}`, 'utf8')) as OwnMatch;
  if (ids && !ids.has(match.id) || !match.bidTrace?.length) continue;
  const row = fullMatch.get(match.id) as { normalized_gzip?: Uint8Array } | undefined;
  if (row?.normalized_gzip) own.push([match, JSON.parse(gunzipSync(row.normalized_gzip).toString()) as HistoricalMatch]);
}
own.sort((a, b) => a[0].createdAt - b[0].createdAt);
const games = limit ? own.slice(-limit) : own;
if (!games.length) throw new Error('No own matches with bid traces and enriched public archives found');

function replay(ownMatch: OwnMatch, match: HistoricalMatch, strategy: Strategy, tieWins: boolean): ReplayResult {
  const traces = new Map((ownMatch.bidTrace ?? []).map(trace => [trace.auctionId, trace]));
  const firstTrace = match.auctions.map(auction => traces.get(auction.id)).find(Boolean);
  let rack: Rack = rackFrom(firstTrace?.rack ?? '');
  let balance = 100, score = 0, bought = 0, late = 0, spent = 0, ties = 0;
  const drawn = Array(26).fill(0);
  const opponents = new Map(match.participants.filter(p => p.botId !== ownBotId)
    .map(p => [p.botId, { botId: p.botId, balance: 100, rackSize: match.rackSize }]));
  const plays = [...match.plays].sort((a, b) => a.at - b.at || a.id - b.id);
  let playIndex = 0;
  const consumePlays = (before: number) => {
    while (playIndex < plays.length && plays[playIndex].at <= before) {
      const play = plays[playIndex++], opponent = opponents.get(play.botId);
      if (opponent) { opponent.balance += play.reward; opponent.rackSize -= play.word.length; }
    }
  };
  for (const auction of match.auctions) {
    consumePlays(auction.opensAt ?? auction.at - match.durationMs);
    drawn[auction.letter.charCodeAt(0) - 65]++;
    const unseen = BAG.map((count, i) => Math.max(0, count - drawn[i] - rack[i]));
    const unseenCount = unseen.reduce((a, b) => a + b, 0);
    const ctx: GameContext = { rack, balance, remaining: auction.remaining, players: match.participants.length,
      activePlayers: match.participants.length, auctionType: match.auctionType, totalAuctions: match.auctions.length,
      frequencies: unseen.map(count => unseenCount ? count / unseenCount : 0), opponents: [...opponents.values()],
      bought, lateBought: late, spent };
    const bid = strategy.bid(auction.letter, ctx).amount;
    let won = false;
    if (auction.topBid !== undefined) {
      won = auction.winner === ownBotId ? bid >= auction.topBid : bid > auction.topBid || (tieWins && bid === auction.topBid);
      if (auction.winner !== ownBotId && bid === auction.topBid) ties++;
    }
    if (won) {
      const payment = match.auctionType === 'FirstPrice' ? bid : auction.winner === ownBotId ? auction.paid : auction.topBid!;
      rack[auction.letter.charCodeAt(0) - 65]++;
      balance -= payment;
      spent += payment;
      bought++;
      if (auction.remaining <= 16) late++;
    }
    const word = strategy.word({ ...ctx, rack, balance });
    if (word.word) {
      const reward = wordScore(word.word);
      rack = subtract(rack, rackFrom(word.word));
      score += reward;
      balance += reward;
    }
    strategy.market.observe(auction.letter, auction.paid, String(auction.id));
    const winner = auction.winner === undefined ? undefined : opponents.get(auction.winner);
    if (winner) { winner.balance -= auction.paid; winner.rackSize++; }
    consumePlays(auction.at);
  }
  const rank = 1 + match.participants.filter(p => p.botId !== ownBotId && p.score > score).length;
  return { matchId: match.id, score, rank, win: rank === 1, bought, late, balance, ties };
}

const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const summarize = (rows: ReplayResult[]) => ({ games: rows.length, score: mean(rows.map(r => r.score)), rank: mean(rows.map(r => r.rank)),
  wins: rows.filter(r => r.win).length, bought: mean(rows.map(r => r.bought)), late: mean(rows.map(r => r.late)),
  balance: mean(rows.map(r => r.balance)), ties: mean(rows.map(r => r.ties)) });
const output = policies.map(([name, policy]) => {
  const makeStrategy = () => {
    const strategy = new Strategy(dictionary, policy);
    strategy.setProfiles(profiles);
    return strategy;
  };
  const lowerStrategy = makeStrategy(), upperStrategy = makeStrategy();
  const lower = games.map(([ownMatch, match]) => replay(ownMatch, match, lowerStrategy, false));
  const upper = games.map(([ownMatch, match]) => replay(ownMatch, match, upperStrategy, true));
  const lowerSummary = summarize(lower), upperSummary = summarize(upper);
  const expected = {
    score: (lowerSummary.score + upperSummary.score) / 2,
    rank: (lowerSummary.rank + upperSummary.rank) / 2,
    wins: (lowerSummary.wins + upperSummary.wins) / 2,
    bought: (lowerSummary.bought + upperSummary.bought) / 2,
    late: (lowerSummary.late + upperSummary.late) / 2,
    balance: (lowerSummary.balance + upperSummary.balance) / 2,
  };
  return { policy: name, lower: lowerSummary, upper: upperSummary, expected };
});
console.log(JSON.stringify({ games: games.length, matches: [games[0][0].id, games.at(-1)![0].id], policies: output }, null, 2));
writeFileSync('data/replay-policy.json', JSON.stringify({ generatedAt: new Date().toISOString(), games: games.map(([match]) => match.id), policies: output }, null, 2));
db.close();
