import type { HistoricalMatch, RankedBot } from './history.js';
import { VALUES, type Rack } from './letters.js';

export interface BidObservation { letter: string; bid: number; paid: number; remaining: number; balance: number; rackSize: number; duplicatesKnown: number; matchAt?: number }
export interface OpponentProfile {
  botId: number; name: string; rating: number; matches: number; firstMatchAt: number; lastMatchAt: number;
  tableSizes: Record<string, number>; meanScore: number; winShare: number;
  meanTilesBought: number; meanSpend: number; meanEndingBalance: number;
  medianWordLength: number; longWordShare: number; medianRackAtPlay: number; medianBalanceAtPlay: number;
  medianTopBid: number; medianPrice: number; bidObservations: BidObservation[];
  letterBids: Record<string, { n: number; median: number; p75: number }>;
}
export function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index), hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}
const mean = (numbers: number[]) => numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;

export function buildProfiles(leaders: RankedBot[], history: HistoricalMatch[]): OpponentProfile[] {
  return leaders.map(leader => {
    const matches = history.filter(m => m.createdAt >= leader.versionStartedAt && m.participants.some(p => p.botId === leader.botId))
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 120);
    const bids: BidObservation[] = [];
    const lengths: number[] = [], racksAtPlay: number[] = [], balancesAtPlay: number[] = [];
    const tableSizes: Record<string, number> = {};
    const scores: number[] = [], spends: number[] = [], bought: number[] = [], ending: number[] = [];
    let wins = 0;
    for (const match of matches) {
      tableSizes[match.participants.length] = (tableSizes[match.participants.length] ?? 0) + 1;
      const participant = match.participants.find(p => p.botId === leader.botId)!;
      scores.push(participant.score); ending.push(participant.balance);
      if (participant.score === Math.max(...match.participants.map(p => p.score))) wins++;
      const ownAuctions = match.auctions.filter(a => a.winner === leader.botId);
      spends.push(ownAuctions.reduce((s, a) => s + a.paid, 0)); bought.push(ownAuctions.length);
      let balance = 100, rackSize = match.rackSize;
      const known = new Uint8Array(26);
      const openStates = new Map<number, { balance: number; rackSize: number; known: Rack }>();
      type Event = { at: number; order: number; kind: 'open' | 'close' | 'play'; row: any };
      const events: Event[] = [
        ...match.auctions.map(a => ({ at: a.opensAt ?? a.at - match.durationMs, order: 2, kind: 'open' as const, row: a })),
        ...ownAuctions.map(a => ({ at: a.at, order: 0, kind: 'close' as const, row: a })),
        ...match.plays.filter(p => p.botId === leader.botId).map(p => ({ at: p.at, order: 1, kind: 'play' as const, row: p })),
      ].sort((a, b) => a.at - b.at || a.order - b.order);
      for (const event of events) {
        const row = event.row;
        if (event.kind === 'open') openStates.set(row.id, { balance, rackSize, known: known.slice() });
        else if (event.kind === 'close') {
          const before = openStates.get(row.id);
          if (row.topBid !== undefined && before) bids.push({ letter: row.letter, bid: row.topBid, paid: row.paid,
            remaining: row.remaining, balance: before.balance, rackSize: before.rackSize,
            duplicatesKnown: before.known[row.letter.charCodeAt(0) - 65], matchAt: match.createdAt });
          balance -= row.paid; rackSize++; known[row.letter.charCodeAt(0) - 65]++;
        } else {
          lengths.push(row.word.length); racksAtPlay.push(rackSize); balancesAtPlay.push(balance);
          balance += row.reward; rackSize -= row.word.length;
          for (const c of row.word) { const i = c.charCodeAt(0) - 65; known[i] = Math.max(0, known[i] - 1); }
        }
      }
    }
    const letterBids: OpponentProfile['letterBids'] = {};
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i), observations = bids.filter(b => b.letter === letter).map(b => b.bid);
      if (observations.length) letterBids[letter] = { n: observations.length, median: quantile(observations, 0.5), p75: quantile(observations, 0.75) };
    }
    return { botId: leader.botId, name: leader.name, rating: leader.rating, matches: matches.length,
      firstMatchAt: Math.min(...matches.map(m => m.createdAt)), lastMatchAt: Math.max(0, ...matches.map(m => m.endedAt)),
      tableSizes, meanScore: mean(scores), winShare: matches.length ? wins / matches.length : 0,
      meanTilesBought: mean(bought), meanSpend: mean(spends), meanEndingBalance: mean(ending),
      medianWordLength: quantile(lengths, 0.5), longWordShare: lengths.length ? lengths.filter(n => n >= 7).length / lengths.length : 0,
      medianRackAtPlay: quantile(racksAtPlay, 0.5), medianBalanceAtPlay: quantile(balancesAtPlay, 0.5),
      medianTopBid: quantile(bids.map(b => b.bid), 0.5), medianPrice: quantile(bids.map(b => b.paid), 0.5),
      bidObservations: bids, letterBids };
  });
}

// Winning bids are a selection-biased sample of the opponent's bids, not
// their complete policy. Condition on nearby observable opening states and
// shrink small samples toward a simple letter-value prior.
export function predictOpponentBid(profile: OpponentProfile, letter: string, remaining: number, balance: number, rackSize: number): number {
  const face = VALUES[letter.charCodeAt(0) - 65];
  const same = profile.bidObservations.filter(b => b.letter === letter);
  const group = same.length >= 8 ? same : profile.bidObservations.filter(b => VALUES[b.letter.charCodeAt(0) - 65] === face);
  const distance = (b: BidObservation) => Math.abs(b.remaining - remaining) / 20 + Math.abs(b.balance - balance) / 80
    + Math.abs(b.rackSize - rackSize) / 8 + 0.25 * Math.log1p(Math.max(0, profile.lastMatchAt - (b.matchAt ?? profile.lastMatchAt)) / 86_400_000);
  const nearest = [...group].sort((a, b) => distance(a) - distance(b)).slice(0, 40);
  const prior = 4 + 2 * face;
  const weight = Math.min(0.85, nearest.length / 20);
  return Math.min(balance, prior * (1 - weight) + quantile(nearest.map(b => b.bid), 0.45) * weight);
}
