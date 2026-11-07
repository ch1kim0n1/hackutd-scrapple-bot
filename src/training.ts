import type { HistoricalMatch } from './history.js';
import type { LiveDecision } from './recording.js';
import { rackFrom, wordScore } from './letters.js';

export const DATASET_SCHEMA = 1;
export const FEATURE_NAMES = [
  ...Array.from({ length: 26 }, (_, i) => `rack_${String.fromCharCode(65 + i)}`),
  ...Array.from({ length: 26 }, (_, i) => `offer_${String.fromCharCode(65 + i)}`),
  ...Array.from({ length: 26 }, (_, i) => `previous_offers_${String.fromCharCode(65 + i)}`),
  'balance_div100', 'score_div100', 'rack_size_div20', 'remaining_div98', 'round_div98',
  'total_rounds_div98', 'players_div20', 'deadline_ms_div1000', 'vickrey',
  'opponent_balance_mean_div100', 'opponent_balance_max_div100', 'opponent_score_max_div100', 'opponent_rack_mean_div20',
];
type PlayerState = { botId: number; balance: number; score: number; rackSize: number };
export interface Features {
  rack: number[] | null; letter: string | null; offeredCounts: number[];
  balance: number | null; score: number | null; rackSize: number | null;
  remaining: number; round: number; totalRounds: number; players: number; deadlineMs: number | null;
  auctionType: 'Vickrey' | 'FirstPrice'; opponents: PlayerState[] | null;
}
export interface TrainingExample {
  schemaVersion: 1; id: string; matchId: number; botId: number | null;
  kind: 'public_bid' | 'public_word' | 'own_bid' | 'own_word' | 'legacy_own_bid';
  provenance: string; observedAt: number | null; policy: string | null;
  features: Features; x: number[]; xMask: number[];
  action: Record<string, unknown>; targets: Record<string, unknown>;
}
export function vectorize(f: Features): { x: number[]; xMask: number[] } {
  const values: (number | null)[] = [
    ...(f.rack ?? Array(26).fill(null)),
    ...Array.from({ length: 26 }, (_, i) => f.letter ? Number(f.letter.charCodeAt(0) - 65 === i) : null),
    ...f.offeredCounts,
    f.balance === null ? null : f.balance / 100, f.score === null ? null : f.score / 100,
    f.rackSize === null ? null : f.rackSize / 20, f.remaining / 98, f.round / 98, f.totalRounds / 98,
    f.players / 20, f.deadlineMs === null ? null : f.deadlineMs / 1000, Number(f.auctionType === 'Vickrey'),
  ];
  const others = f.opponents;
  values.push(others?.length ? others.reduce((n, p) => n + p.balance, 0) / others.length / 100 : null,
    others?.length ? Math.max(...others.map(p => p.balance)) / 100 : null,
    others?.length ? Math.max(...others.map(p => p.score)) / 100 : null,
    others?.length ? others.reduce((n, p) => n + p.rackSize, 0) / others.length / 20 : null);
  return { x: values.map(v => v ?? 0), xMask: values.map(v => Number(v !== null)) };
}

export function buildExamples(match: HistoricalMatch, live: LiveDecision[] = [], own?: Record<string, any>): TrainingExample[] {
  const states = new Map<number, PlayerState>(match.participants.map(p => [p.botId, { botId: p.botId, balance: 100, score: 0, rackSize: match.rackSize }]));
  const participants = match.participants;
  const maxScore = Math.max(...participants.map(p => p.score));
  const outcome = (botId: number, scoreNow: number | null) => {
    const p = participants.find(p => p.botId === botId)!;
    return { finalScore: p.score, endingBalance: p.balance, rank: 1 + participants.filter(o => o.score > p.score).length,
      topFinish: p.score === maxScore, tiedTop: p.score === maxScore && participants.filter(o => o.score === maxScore).length > 1,
      scoreToGo: scoreNow === null ? null : p.score - scoreNow };
  };
  const examples: TrainingExample[] = [];
  const add = (sample: Omit<TrainingExample, 'schemaVersion' | 'matchId' | 'x' | 'xMask'>) => {
    examples.push({ schemaVersion: DATASET_SCHEMA, matchId: match.id, ...sample, ...vectorize(sample.features) });
  };
  const offers = Array(26).fill(0) as number[];
  const events = [
    ...match.auctions.map((auction, index) => ({ kind: 'open' as const, at: auction.opensAt ?? auction.at - match.durationMs, auction, index })),
    ...match.auctions.map((auction, index) => ({ kind: 'close' as const, at: auction.at, auction, index })),
    ...match.plays.map(play => ({ kind: 'word' as const, at: play.at, play })),
  ].sort((a, b) => a.at - b.at || ({ open: 0, close: 1, word: 2 }[a.kind] - { open: 0, close: 1, word: 2 }[b.kind]));
  // Features at a timestamp use only events strictly earlier than that time.
  // A tie is deliberately conservative: no future award/reward enters inputs.
  let round = 0;
  const base = (botId: number, letter: string | null): Features => {
    const p = states.get(botId)!;
    return { rack: null, letter, offeredCounts: [...offers], balance: p.balance, score: p.score, rackSize: p.rackSize,
      remaining: match.auctions.length - round, round, totalRounds: match.auctions.length,
      players: participants.length, deadlineMs: null, auctionType: match.auctionType,
      opponents: [...states.values()].filter(p => p.botId !== botId).map(p => ({ ...p })) };
  };
  for (let start = 0; start < events.length;) {
    let end = start + 1;
    while (end < events.length && events[end].at === events[start].at) end++;
    const group = events.slice(start, end);
    for (const event of group) {
      if (event.kind === 'open') {
        for (const p of participants) {
          const f = base(p.botId, event.auction.letter);
          f.round = event.index + 1; f.remaining = event.auction.remaining;
          const won = event.auction.winner === p.botId;
          add({ id: `${match.id}:auction:${event.auction.id}:bot:${p.botId}`, botId: p.botId, kind: 'public_bid',
            provenance: 'completed_public_archive; state_before_auction_open', observedAt: event.at, policy: null, features: f,
            action: { bidAmount: won ? event.auction.topBid ?? null : null, bidAmountKnown: won && event.auction.topBid !== undefined,
              accepted: null, status: 'historical_unknown' },
            targets: { ...outcome(p.botId, f.score), auctionWon: won, clearingPrice: event.auction.paid,
              winningBid: event.auction.topBid ?? null, winnerBotId: event.auction.winner ?? null, immediateReward: 0 } });
        }
      } else if (event.kind === 'word') {
        const f = base(event.play.botId, null);
        add({ id: `${match.id}:word:${event.play.id}`, botId: event.play.botId, kind: 'public_word',
          provenance: 'completed_public_archive; private_letters_unknown', observedAt: event.at, policy: null, features: f,
          action: { word: event.play.word, wordCounts: [...rackFrom(event.play.word)], accepted: true, status: 'submitted' },
          targets: { ...outcome(event.play.botId, f.score), immediateReward: event.play.reward } });
      }
    }
    for (const event of group) {
      if (event.kind === 'open') { offers[event.auction.letter.charCodeAt(0) - 65]++; round = event.index + 1; }
      else if (event.kind === 'close' && event.auction.winner !== undefined) {
        const p = states.get(event.auction.winner)!; p.balance -= event.auction.paid; p.rackSize++;
      } else if (event.kind === 'word') {
        const p = states.get(event.play.botId)!; p.balance += event.play.reward; p.score += event.play.reward; p.rackSize -= event.play.word.length;
      }
    }
    start = end;
  }
  const seen = new Set<string>();
  for (const d of live) {
    if (seen.has(d.id) || d.matchId !== match.id || !states.has(d.botId)) continue;
    seen.add(d.id);
    const f: Features = { ...d.features, rackSize: d.features.rack.reduce((n, c) => n + c, 0) };
    const sale = match.auctions.find(a => a.id === d.auctionId);
    add({ id: `live:${d.id}`, botId: d.botId, kind: d.kind === 'bid' ? 'own_bid' : 'own_word',
      provenance: 'live_private_observation', observedAt: d.observedAt, policy: d.policy, features: f, action: d.action,
      targets: { ...outcome(d.botId, f.score), auctionWon: sale ? sale.winner === d.botId : null,
        clearingPrice: sale?.paid ?? null, winningBid: sale?.topBid ?? null,
        immediateReward: d.kind === 'word' && d.action.accepted && d.action.word ? wordScore(d.action.word) : 0 } });
  }
  for (const trace of own?.bidTrace ?? []) {
    const botId = own!.botId as number;
    if (!states.has(botId) || typeof trace.rack !== 'string') continue;
    const sale = match.auctions.find(a => a.id === trace.auctionId);
    if (!sale) continue;
    if (live.some(d => d.kind === 'bid' && d.auctionId === trace.auctionId)) continue;
    // The old log has a real rack/balance, but no decision timestamp or
    // synchronized opponent state. Keep those unavailable features masked.
    const f: Features = { rack: [...rackFrom(trace.rack)], letter: sale.letter, offeredCounts: Array(26).fill(0),
      balance: trace.balance, score: null, rackSize: trace.rack.length, remaining: trace.remaining,
      round: match.auctions.length - trace.remaining, totalRounds: match.auctions.length, players: participants.length,
      deadlineMs: null, auctionType: match.auctionType, opponents: null };
    const vector = vectorize(f); vector.xMask.fill(0, 52, 78);
    examples.push({ schemaVersion: DATASET_SCHEMA, id: `${match.id}:legacy-bid:${sale.id}`, matchId: match.id, botId,
      kind: 'legacy_own_bid', provenance: 'legacy_partial_private_trace; decision_time_unknown', observedAt: null,
      policy: trace.policy ?? own!.policy ?? null, features: f, ...vector,
      action: { amount: trace.bid, accepted: true, status: 'submitted' },
      targets: { ...outcome(botId, null), auctionWon: sale.winner === botId, clearingPrice: sale.paid,
        winningBid: sale.topBid ?? null, immediateReward: 0 } });
  }
  return examples;
}

export function chronologicalSplits(games: { id: number; endedAt: number }[]): Map<number, 'train' | 'validation' | 'test'> {
  const ordered = [...games].sort((a, b) => a.endedAt - b.endedAt || a.id - b.id);
  const trainEnd = Math.floor(ordered.length * 0.8), validationEnd = Math.floor(ordered.length * 0.9);
  return new Map(ordered.map((g, i) => [g.id, i < trainEnd ? 'train' : i < validationEnd ? 'validation' : 'test']));
}
