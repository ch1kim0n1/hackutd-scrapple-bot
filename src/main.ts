import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { DbConnection, type SubscriptionHandle } from './module_bindings/index.js';
import type { Auction, Match } from './module_bindings/types.js';
import { BOT_ID, DATABASE, HOST, loadToken, saveToken } from './config.js';
import { loadDictionary } from './dictionary.js';
import { BAG, VALUES, rackString, type Rack } from './letters.js';
import { BASE_REVISION, DEFAULT_POLICY, POLICY_VERSION, Strategy, V5_POLICY, type GameContext } from './strategy.js';
import type { HistoricalMatch } from './history.js';
import { validateMatch } from './history.js';
import { maybeStartRequestedVersion } from './versioning.js';
import { DecisionRecorder, type LiveDecision } from './recording.js';

mkdirSync('logs', { recursive: true });
mkdirSync('.run', { recursive: true });
mkdirSync('data/learning/self', { recursive: true });
let activeRevision = BASE_REVISION;
// A/B: set AB=1 to alternate sustainable-v12b and the sustainable-v5 baseline by match id.
// Default runs only the current policy.
const ARMS = process.env.AB === '1' ? [{ revision: POLICY_VERSION, policy: DEFAULT_POLICY }, { revision: 'sustainable-v5', policy: V5_POLICY }]
  : [{ revision: POLICY_VERSION, policy: DEFAULT_POLICY }];
const bootAt = Date.now();
const policyLineage = new Map<bigint, Set<string>>();
const log = (event: string, details: Record<string, unknown> = {}) => {
  const line = JSON.stringify({ time: new Date().toISOString(), policy: activeRevision, event, ...details });
  console.log(line); appendFileSync('logs/bot.jsonl', line + '\n');
};
const strategy = new Strategy(loadDictionary());
const recorder = new DecisionRecorder();
try { if (existsSync('.run/market.json')) strategy.market.restore(JSON.parse(readFileSync('.run/market.json', 'utf8'))); } catch {}
const token = loadToken();
if (!token) throw new Error('No bot token. Run npm run provision first.');
let conn: DbConnection | undefined;
let ready = false, stopping = false, reconnectAttempt = 0;
let reconnectTimer: NodeJS.Timeout | undefined;
const matchSubscriptions = new Map<bigint, SubscriptionHandle>();
const matchesReady = new Set<bigint>();
const lastBid = new Map<bigint, { amount: number; rack: string }>();
const lastWord = new Map<bigint, string>();
const wordInFlight = new Set<bigint>();
const activeStarted = new Set<bigint>();
const ended = new Set<bigint>();
const learnedAuctions = new Set<bigint>();
let pumpTimer: NodeJS.Timeout | undefined;
let joinInFlight = false, lastJoinAttempt = 0;
let modelReadAt = 0;
let pendingChampion: { revision: string; policy: Record<string, number> } | undefined;
const bidTraces = new Map<bigint, Map<bigint, Record<string, unknown>>>();
function refreshLearning() {
  if (Date.now() - modelReadAt >= 10_000) {
    modelReadAt = Date.now();
    try {
      if (existsSync('data/learning/profiles.json')) strategy.setProfiles(JSON.parse(readFileSync('data/learning/profiles.json', 'utf8')).profiles.filter((p: { matches: number }) => p.matches >= 8));
      if (ARMS.length === 1 && existsSync('.run/champion.json')) {
        const champion = JSON.parse(readFileSync('.run/champion.json', 'utf8'));
        if (champion.revision !== activeRevision) pendingChampion = champion;
      }
    } catch (error) { log('learning_reload_error', { error: String(error) }); }
  }
  if (pendingChampion && !runningMatches().length) {
    try {
      strategy.setPolicy(pendingChampion.policy); activeRevision = pendingChampion.revision; pendingChampion = undefined;
      log('policy_loaded', { revision: activeRevision, parameters: strategy.policy });
    } catch (error) { pendingChampion = undefined; log('policy_rejected', { error: String(error) }); }
  }
}

function archiveMatch(match: Match) {
  if (!conn) return;
  const participants = [...conn.db.matchParticipant.iter()].filter(p => p.matchId === match.id);
  const sales = new Map([...conn.db.auctionResult.iter()].filter(r => r.matchId === match.id).map(r => [r.auctionId, r]));
  const auctions = [...conn.db.auction.iter()].filter(a => a.matchId === match.id).sort((a, b) => Number(a.id - b.id));
  const plays = [...conn.db.wordPlay.iter()].filter(p => p.matchId === match.id);
  const record: HistoricalMatch = { id: Number(match.id), createdAt: Number(match.createdAt.microsSinceUnixEpoch) / 1000,
    endedAt: Number(match.endedAt!.microsSinceUnixEpoch) / 1000, rackSize: match.startingRackSize,
    durationMs: Number(match.auctionDurationMs), auctionType: match.auctionType.tag,
    participants: participants.map(p => ({ botId: Number(p.botId), score: Number(p.score), balance: Number(p.balance) })),
    auctions: auctions.map((a, i) => { const sale = sales.get(a.id); return { id: Number(a.id), letter: a.letter,
      winner: sale?.winnerBotId === undefined ? undefined : Number(sale.winnerBotId), paid: Number(sale?.paid),
      opensAt: Number(a.opensAt.microsSinceUnixEpoch) / 1000, at: Number(sale?.closedAt.microsSinceUnixEpoch) / 1000,
      remaining: auctions.length - i - 1 }; }),
    plays: plays.map(p => ({ id: Number(p.id), botId: Number(p.botId), word: p.word, reward: Number(p.totalReward), at: Number(p.playedAt.microsSinceUnixEpoch) / 1000 })) };
  const mine = record.participants.find(p => p.botId === Number(BOT_ID))!;
  const rank = 1 + record.participants.filter(p => p.score > mine.score).length;
  const leftover = currentRack(match.id);
  const leftoverScore = strategy.planner.plan(leftover).score;
  const tilesBought = record.auctions.filter(a => a.winner === Number(BOT_ID)).length;
  const flags = [];
  if (rank > 1 && mine.balance > 35 && tilesBought < record.auctions.length / 3) flags.push('unused-budget-and-low-acquisition');
  if (leftoverScore > 0) flags.push('playable-tiles-left-at-close');
  if (mine.balance < 5) flags.push('ended-with-low-liquidity');
  const qualityErrors = validateMatch(record);
  writeFileSync(`data/learning/self/${match.id}.json`, JSON.stringify({ ...record, botId: Number(BOT_ID), policy: activeRevision,
    mixedPolicy: record.createdAt < bootAt || (policyLineage.get(match.id)?.size ?? 0) > 1,
    rank, score: mine.score, endingBalance: mine.balance, tilesBought, tilePoints: record.auctions.filter(a => a.winner === Number(BOT_ID)).reduce((n, a) => n + (VALUES[a.letter.charCodeAt(0) - 65] ?? 0), 0), leftoverRack: rackString(leftover), leftoverScore, flags, qualityErrors,
    bidTrace: [...(bidTraces.get(match.id)?.values() ?? [])] }));
  bidTraces.delete(match.id); policyLineage.delete(match.id);
  writeFileSync('.run/market.json.tmp', JSON.stringify(strategy.market.snapshot())); renameSync('.run/market.json.tmp', '.run/market.json');
  log('game_learned', { match: String(match.id), rank, score: mine.score, endingBalance: mine.balance, tilesBought, leftoverScore, flags, qualityErrors });
  void maybeStartRequestedVersion().then(result => { if (result) log('website_version_started', result); })
    .catch(error => log('version_plan_error', { error: String(error) }));
}

function currentRack(matchId: bigint): Rack {
  const rack = new Uint8Array(26);
  for (const holding of conn!.db.myRack.iter()) if (holding.matchId === matchId) {
    rack[holding.letter.charCodeAt(0) - 65] += holding.count;
  }
  return rack;
}
function context(match: Match): GameContext | null {
  const participants = [...conn!.db.matchParticipant.iter()].filter(p => p.matchId === match.id);
  const own = participants.find(p => p.botId === BOT_ID);
  if (!own) return null;
  // Initial private tiles can be recovered for ourselves on reconnect:
  // current rack + played tiles - auction wins. Other starting racks stay unknown.
  const rack = currentRack(match.id);
  const initial = Int16Array.from(rack);
  for (const play of conn!.db.wordPlay.iter()) if (play.matchId === match.id && play.botId === BOT_ID) {
    for (const c of play.word) initial[c.charCodeAt(0) - 65]++;
  }
  for (const sale of conn!.db.auctionResult.iter()) if (sale.matchId === match.id && sale.winnerBotId === BOT_ID) initial[sale.letter.charCodeAt(0) - 65]--;
  const unseen = BAG.map((n, i) => Math.max(0, n - Math.max(0, initial[i])));
  for (const auction of conn!.db.auction.iter()) if (auction.matchId === match.id) {
    const i = auction.letter.charCodeAt(0) - 65; unseen[i] = Math.max(0, unseen[i] - 1);
  }
  const unseenCount = unseen.reduce((a, b) => a + b, 0);
  const matchAuctions = [...conn!.db.auction.iter()].filter(a => a.matchId === match.id)
    .sort((a, b) => Number(a.opensAt.microsSinceUnixEpoch - b.opensAt.microsSinceUnixEpoch));
  const positions = new Map(matchAuctions.map((auction, index) => [auction.id, index]));
  const ownSales = [...conn!.db.auctionResult.iter()].filter(sale => sale.matchId === match.id && sale.winnerBotId === BOT_ID);
  const totalAuctions = match.currentRound + match.bagTotal;
  return { rack, balance: Number(own.balance), remaining: match.bagTotal, players: participants.length,
    bought: ownSales.length, spent: ownSales.reduce((sum, sale) => sum + Number(sale.paid), 0),
    lateBought: ownSales.filter(sale => (positions.get(sale.auctionId) ?? 0) >= totalAuctions - 16).length,
    round: match.currentRound, totalAuctions,
    activePlayers: match.currentRound < 8 ? participants.length : Math.max(2, 1 + participants.filter(p => p.botId !== BOT_ID && (p.balance !== 100n || p.score > 0n)).length),
    auctionType: match.auctionType.tag, frequencies: unseen.map(n => unseenCount ? n / unseenCount : 0),
    opponents: participants.filter(p => p.botId !== BOT_ID).map(p => {
      const bot = conn!.db.bot.id.find(p.botId);
      return { botId: Number(p.botId), balance: Number(p.balance), score: Number(p.score),
        simulatedStrategy: bot?.isSimulated ? bot.strategy.tag : undefined,
        rackSize: match.startingRackSize + [...conn!.db.auctionResult.iter()].filter(a => a.matchId === match.id && a.winnerBotId === p.botId).length
          - [...conn!.db.wordPlay.iter()].filter(w => w.matchId === match.id && w.botId === p.botId).reduce((s, w) => s + w.word.length, 0) };
    }) };
}
function schedulePump() {
  if (pumpTimer) return;
  pumpTimer = setTimeout(() => { pumpTimer = undefined; pump(); }, 8);
}
function subscribeMatch(matchId: bigint) {
  if (!conn || matchSubscriptions.has(matchId)) return;
  const handle = conn.subscriptionBuilder()
    .onApplied(() => { matchesReady.add(matchId); schedulePump(); })
    .onError(ctx => log('match_subscription_error', { match: String(matchId), error: String(ctx.event) }))
    .subscribe([
      `SELECT * FROM match_participant WHERE match_id = ${matchId}`,
      `SELECT * FROM auction WHERE match_id = ${matchId}`,
      `SELECT * FROM auction_result WHERE match_id = ${matchId}`,
      `SELECT * FROM word_play WHERE match_id = ${matchId}`,
    ]);
  matchSubscriptions.set(matchId, handle);
}
function runningMatches() {
  return [...conn!.db.matchState.iter()].filter(m => m.status.tag === 'Running');
}
function captureDecision(kind: 'bid' | 'word', matchId: bigint, game: GameContext, auction?: Auction) {
  const participants = [...conn!.db.matchParticipant.iter()].filter(p => p.matchId === matchId);
  const offeredCounts = Array(26).fill(0) as number[];
  for (const a of conn!.db.auction.iter()) if (a.matchId === matchId && a.id !== auction?.id) offeredCounts[a.letter.charCodeAt(0) - 65]++;
  return recorder.capture(Number(matchId), Number(BOT_ID), activeRevision, kind, game, {
    auctionId: kind === 'bid' && auction ? Number(auction.id) : undefined,
    letter: auction?.letter, deadlineMs: auction ? Math.max(0, Number(auction.closesAt.microsSinceUnixEpoch) / 1000 - Date.now()) : undefined,
    score: Number(participants.find(p => p.botId === BOT_ID)!.score), offeredCounts,
    opponents: (game.opponents ?? []).map(p => ({ ...p, score: Number(participants.find(o => Number(o.botId) === p.botId)!.score) })),
  });
}
function recordDecision(state: Omit<LiveDecision, 'action'>, action: LiveDecision['action']) {
  try { recorder.append(state, action); }
  catch (error) { log('recording_error', { match: state.matchId, error: String(error) }); }
}
async function join() {
  if (!conn || !ready || stopping || joinInFlight || runningMatches().length || Date.now() - lastJoinAttempt < 5000) return;
  const lobby = [...conn.db.openLobbies.iter()][0];
  if (lobby && [...conn.db.openLobbyMembers.iter()].some(m => m.lobbyId === lobby.id && m.botId === BOT_ID)) return;
  lastJoinAttempt = Date.now(); joinInFlight = true;
  try { await conn.reducers.joinLobby({}); log('lobby_joined'); }
  catch (error) { log('lobby_wait', { error: String(error) }); }
  finally { joinInFlight = false; }
}
async function bid(auction: Auction, game: GameContext) {
  const remainingMs = Number(auction.closesAt.microsSinceUnixEpoch) / 1000 - Date.now();
  if (remainingMs < 160 || !conn) return;
  const previous = lastBid.get(auction.id);
  const rack = rackString(game.rack);
  if (previous?.rack === rack) return;
  const observation = captureDecision('bid', auction.matchId, game, auction);
  const t = performance.now();
  const decision = strategy.bid(auction.letter, game);
  const computeMs = performance.now() - t;
  if (Number(auction.closesAt.microsSinceUnixEpoch) / 1000 - Date.now() < 90) { recordDecision(observation, { amount: decision.amount, accepted: false, status: 'expired' }); return; }
  if (!previous && decision.amount === 0) { lastBid.set(auction.id, { amount: 0, rack }); recordDecision(observation, { amount: 0, accepted: true, status: 'abstain' }); return; }
  if (previous?.amount === decision.amount) { lastBid.set(auction.id, { ...previous, rack }); recordDecision(observation, { amount: decision.amount, accepted: null, status: 'unchanged' }); return; }
  lastBid.set(auction.id, { amount: decision.amount, rack });
  try {
    await conn.reducers.submitBid({ auctionId: auction.id, amount: BigInt(decision.amount) });
    recordDecision(observation, { amount: decision.amount, accepted: true, status: 'submitted' });
    const trace = bidTraces.get(auction.matchId) ?? new Map<bigint, Record<string, unknown>>();
    trace.set(auction.id, { auctionId: Number(auction.id), letter: auction.letter, bid: decision.amount, value: decision.value,
      cashGain: decision.cashGain ?? 0, balance: game.balance, rack, remaining: game.remaining, policy: activeRevision });
    bidTraces.set(auction.matchId, trace);
    log('bid', { match: String(auction.matchId), auction: String(auction.id), letter: auction.letter, amount: decision.amount,
      balance: game.balance, remaining: game.remaining, computeMs: Math.round(computeMs), reason: decision.reason });
  } catch (error) { recordDecision(observation, { amount: decision.amount, accepted: false, status: 'failed' }); lastBid.delete(auction.id); log('bid_error', { auction: String(auction.id), error: String(error) }); }
}
async function play(match: Match, game: GameContext) {
  if (!conn || wordInFlight.has(match.id)) return;
  const signature = `${rackString(game.rack)}:${game.balance}:${game.remaining}`;
  if (lastWord.get(match.id) === signature) return;
  const observation = captureDecision('word', match.id, game);
  const decision = strategy.word(game);
  lastWord.set(match.id, signature);
  if (!decision.word) { recordDecision(observation, { word: null, accepted: true, status: 'abstain' }); return; }
  wordInFlight.add(match.id);
  try {
    await conn.reducers.submitWord({ matchId: match.id, word: decision.word });
    recordDecision(observation, { word: decision.word, accepted: true, status: 'submitted' });
    log('word', { match: String(match.id), word: decision.word, reason: decision.reason });
  } catch (error) {
    recordDecision(observation, { word: decision.word, accepted: false, status: 'failed' });
    lastWord.delete(match.id); log('word_error', { match: String(match.id), word: decision.word, error: String(error) });
  } finally { wordInFlight.delete(match.id); schedulePump(); }
}
function useArm(matchId: bigint) {
  const arm = ARMS[Number(matchId % BigInt(ARMS.length))];
  if (activeRevision !== arm.revision) { strategy.setPolicy(arm.policy); activeRevision = arm.revision; log('arm_selected', { match: String(matchId), revision: arm.revision }); }
}
function pump() {
  if (!ready || !conn || stopping) return;
  refreshLearning();
  for (const match of runningMatches()) {
    useArm(match.id);
    const lineage = policyLineage.get(match.id) ?? new Set<string>(); lineage.add(activeRevision); policyLineage.set(match.id, lineage);
    subscribeMatch(match.id);
    if (!matchesReady.has(match.id)) continue;
    const game = context(match);
    if (!game) continue;
    if (!activeStarted.has(match.id)) {
      activeStarted.add(match.id); log('match_started', { match: String(match.id), players: game.players, rack: rackString(game.rack) });
    }
    // Bid first so dictionary work for selling words cannot delay the auction.
    const auction = match.currentAuctionId === undefined ? undefined : conn.db.auction.id.find(match.currentAuctionId);
    if (auction?.status.tag === 'Open') void bid(auction, game);
    void play(match, game);
  }
  void join();
}
function connect() {
  if (stopping) return;
  ready = false; matchSubscriptions.clear(); matchesReady.clear(); lastBid.clear(); lastWord.clear(); wordInFlight.clear();
  log('connecting', { host: HOST, database: DATABASE, bot: String(BOT_ID), policy: POLICY_VERSION });
  conn = DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE).withToken(loadToken())
    .onConnect((connection, identity, freshToken) => {
      conn = connection; saveToken(freshToken); reconnectAttempt = 0;
      connection.subscriptionBuilder().onApplied(() => {
        const credential = connection.db.botCredential.identity.find(identity);
        if (credential?.botId !== BOT_ID) { log('credential_mismatch'); stopping = true; connection.disconnect(); process.exitCode = 1; return; }
        ready = true; log('connected', { bot: String(BOT_ID) }); schedulePump();
      }).onError(ctx => { log('subscription_error', { error: String(ctx.event) }); connection.disconnect(); retryConnect(); })
        .subscribe([
          `SELECT * FROM bot_credential WHERE bot_id = ${BOT_ID}`, 'SELECT * FROM bot',
          'SELECT * FROM my_rack', 'SELECT * FROM open_lobbies', 'SELECT * FROM open_lobby_members',
          `SELECT match_state.* FROM match_state JOIN match_participant ON match_state.id = match_participant.match_id WHERE match_participant.bot_id = ${BOT_ID}`,
        ]);
      connection.db.matchState.onInsert((_ctx, match) => { if (match.status.tag === 'Running') { subscribeMatch(match.id); schedulePump(); } });
      connection.db.matchState.onUpdate((_ctx, old, match) => {
        if (match.status.tag === 'Running') schedulePump();
        if (old.status.tag !== 'Ended' && match.status.tag === 'Ended' && !ended.has(match.id)) {
          ended.add(match.id);
          const standings = [...connection.db.matchParticipant.iter()].filter(p => p.matchId === match.id)
            .sort((a, b) => Number(b.score - a.score));
          log('match_ended', { match: String(match.id), standings: standings.map(p => ({ bot: String(p.botId), score: Number(p.score), balance: Number(p.balance) })) });
          setTimeout(() => archiveMatch(match), 30);
          setTimeout(() => {
            matchSubscriptions.get(match.id)?.unsubscribe(); matchSubscriptions.delete(match.id); matchesReady.delete(match.id);
            activeStarted.delete(match.id); lastWord.delete(match.id);
            for (const sale of connection.db.auctionResult.iter()) if (sale.matchId === match.id) learnedAuctions.delete(sale.auctionId);
            schedulePump();
          }, 250);
        }
      });
      connection.db.auction.onInsert(() => schedulePump());
      connection.db.myRack.onInsert(() => schedulePump());
      connection.db.myRack.onUpdate(() => schedulePump());
      connection.db.myRack.onDelete(() => schedulePump());
      connection.db.matchParticipant.onUpdate(() => schedulePump());
      connection.db.openLobbies.onInsert(() => schedulePump());
      connection.db.auctionResult.onInsert((_ctx, result) => {
        if (!learnedAuctions.has(result.auctionId)) {
          learnedAuctions.add(result.auctionId); strategy.market.observe(result.letter, Number(result.paid), String(result.auctionId));
        }
        // Closed auctions no longer need de-duplication entries.
        lastBid.delete(result.auctionId);
        schedulePump();
      });
    })
    .onConnectError((_ctx, error) => { log('connect_error', { error: String(error) }); retryConnect(); })
    .onDisconnect(() => { ready = false; log('disconnected'); retryConnect(); })
    .build();
}
function retryConnect() {
  if (stopping || reconnectTimer) return;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt++, 5));
  reconnectTimer = setTimeout(() => { reconnectTimer = undefined; connect(); }, delay);
}
const interval = setInterval(() => {
  schedulePump();
  writeFileSync('.run/status.json', JSON.stringify({ time: new Date().toISOString(), pid: process.pid, connected: ready,
    bot: String(BOT_ID), running: conn ? runningMatches().map(m => String(m.id)) : [] }));
}, 500);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  stopping = true; clearInterval(interval); clearTimeout(pumpTimer); clearTimeout(reconnectTimer); conn?.disconnect();
  log('stopped'); process.exit(0);
});
connect();
void maybeStartRequestedVersion().then(result => { if (result) log('website_version_started', result); })
  .catch(error => log('version_plan_error', { error: String(error) }));
