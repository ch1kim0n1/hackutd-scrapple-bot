import type { Dictionary } from './dictionary.js';
import { BAG, rackFrom, subtract, VALUES, wordScore, type Rack } from './letters.js';
import { Strategy, type GameContext, type Policy } from './strategy.js';
import { predictOpponentBid, type OpponentProfile } from './opponents.js';
import { Strategy as LegacyStrategy } from './legacy-strategy.js';

export function seeded(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
type Actor = { rack: Rack; balance: number; score: number; spent: number };
export function simulate(dictionary: Dictionary, seed: number, hero: boolean, opponents: 'starter' | 'patient' | 'strategic' | 'aggressive' | 'observed' = 'starter', options: { policy?: Partial<Policy>; profiles?: OpponentProfile[]; incumbent?: Partial<Policy>; legacyHero?: boolean } = {}) {
  const random = seeded(seed);
  const bag = BAG.flatMap((n, i) => Array.from({ length: n }, () => i));
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  const actors: Actor[] = Array.from({ length: 6 }, () => ({ rack: new Uint8Array(26), balance: 100, score: 0, spent: 0 }));
  for (const actor of actors) for (let i = 0; i < 5; i++) actor.rack[bag.pop()!]++;
  const totalAuctions = bag.length;
  const strategies = actors.map((_, i) => i === 0 && !options.legacyHero ? new Strategy(dictionary, options.policy) : new LegacyStrategy(dictionary, options.incumbent));
  for (const strategy of strategies) strategy.setProfiles(options.profiles ?? []);
  const profileOf = (i: number) => opponents === 'observed' && i > 0 && i < 4 ? options.profiles?.[i - 1] : undefined;
  const actorId = (i: number) => profileOf(i)?.botId ?? 10000 + i;
  const opponentContext = (i: number) => actors.flatMap((a, j) => j === i ? [] : [{ botId: actorId(j), balance: a.balance, rackSize: Array.from(a.rack).reduce((s, n) => s + n, 0) }]);
  const contextFor = (i: number, remaining: number): GameContext => ({ rack: actors[i].rack, balance: actors[i].balance,
    remaining, players: 6, auctionType: 'Vickrey', opponents: opponentContext(i), round: totalAuctions - remaining, totalAuctions });
  const checkpoints: { round: number; score: number; balance: number; tiles: number; rank: number }[] = [];
  const play = (remaining: number) => {
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      for (let attempt = 0; attempt < 30; attempt++) {
        const playable = [...dictionary.playable(actor.rack)];
        let word: string | null;
        if ((hero && i === 0) || (opponents === 'strategic' && i > 0) || (opponents === 'observed' && i === 4)) word = strategies[i].word(contextFor(i, remaining)).word;
        else {
          playable.sort((a, b) => b.text.length - a.text.length || a.text.localeCompare(b.text));
          const first = playable[0];
          word = first?.text ?? null;
          if ((opponents === 'patient' || opponents === 'aggressive') && first && first.text.length < 6 && remaining > 5 && actor.balance > 20 && Array.from(actor.rack).reduce((a, b) => a + b, 0) < 12) word = null;
          const profile = profileOf(i);
          if (profile && first && remaining > 5 && first.text.length < profile.medianWordLength
            && actor.balance > Math.max(10, Math.min(40, profile.medianBalanceAtPlay))
            && Array.from(actor.rack).reduce((a, b) => a + b, 0) < profile.medianRackAtPlay) word = null;
        }
        if (!word) break;
        const counts = rackFrom(word);
        for (let slot = 0; slot < 26; slot++) if (counts[slot] > actor.rack[slot]) throw new Error('Impossible simulated play');
        actor.rack = subtract(actor.rack, counts);
        const reward = wordScore(word); actor.balance += reward; actor.score += reward;
      }
    }
  };
  // The first auction is already drawn when clients receive their racks.
  while (bag.length) {
    const letter = bag.pop()!;
    play(bag.length);
    const bids = actors.map((actor, i) => ({ i, amount: (hero && i === 0) || (opponents === 'strategic' && i > 0) || (opponents === 'observed' && i === 4)
      ? strategies[i].bid(String.fromCharCode(65 + letter), contextFor(i, bag.length)).amount
      : profileOf(i) ? Math.max(0, Math.min(actor.balance, Math.round(predictOpponentBid(profileOf(i)!, String.fromCharCode(65 + letter), bag.length, actor.balance, Array.from(actor.rack).reduce((s, n) => s + n, 0)) + Math.floor(random() * 3) - 1)))
      : Math.min(actor.balance, opponents === 'aggressive' || opponents === 'observed'
        ? Math.max(1, Math.floor((4 + VALUES[letter] * 2) * (actor.rack[letter] > 1 ? 0.5 : 1)))
        : VALUES[letter] + (actor.rack[letter] ? 0 : 2)) }));
    // Random tie order, then stable descending price.
    for (let i = bids.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [bids[i], bids[j]] = [bids[j], bids[i]]; }
    bids.sort((a, b) => b.amount - a.amount);
    if (bids[0].amount > 0) {
      const winner = actors[bids[0].i];
      const paid = Math.max(1, bids[1].amount);
      winner.balance -= paid; winner.spent += paid; winner.rack[letter]++;
      for (const strategy of strategies) strategy.market.observe(String.fromCharCode(65 + letter), paid);
    }
    // The last tile cannot be used by any external client. All other
    // rounds get a reaction before the next one-second deadline.
    if (bag.length) play(bag.length);
    const round = totalAuctions - bag.length;
    if (round % 10 === 0 || !bag.length) checkpoints.push({ round, score: actors[0].score, balance: actors[0].balance,
      tiles: Array.from(actors[0].rack).reduce((a, b) => a + b, 0), rank: 1 + actors.filter(a => a.score > actors[0].score).length });
  }
  return { seed, scores: actors.map(a => a.score), hero: actors[0].score,
    win: actors[0].score >= Math.max(...actors.map(a => a.score)),
    rank: 1 + actors.filter(a => a.score > actors[0].score).length,
    balances: actors.map(a => a.balance), checkpoints };
}
