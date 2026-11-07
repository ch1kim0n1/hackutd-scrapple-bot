import { appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { GameContext } from './strategy.js';

export interface LiveDecision {
  schemaVersion: 1; id: string; matchId: number; botId: number; policy: string;
  observedAt: number; kind: 'bid' | 'word'; auctionId: number | null;
  features: {
    rack: number[]; balance: number; score: number; remaining: number; round: number;
    totalRounds: number; players: number; auctionType: 'Vickrey' | 'FirstPrice';
    offeredCounts: number[]; letter: string | null; deadlineMs: number | null;
    opponents: { botId: number; balance: number; score: number; rackSize: number }[];
  };
  action: { amount?: number; word?: string | null; accepted: boolean | null; status: 'submitted' | 'abstain' | 'failed' | 'expired' | 'unchanged' };
}

// Append outside the learner's SQLite database so recording never waits on a
// database writer. Each line has a stable ID and survives reconnect/restarts.
export class DecisionRecorder {
  private session = randomUUID();
  private sequence = 0;
  constructor(readonly directory = 'data/training/live') { mkdirSync(directory, { recursive: true }); }
  capture(matchId: number, botId: number, policy: string, kind: LiveDecision['kind'], game: GameContext,
    extra: { auctionId?: number; letter?: string; deadlineMs?: number; score: number; offeredCounts: number[];
      opponents: LiveDecision['features']['opponents'] }): Omit<LiveDecision, 'action'> {
    return { schemaVersion: 1, id: `${this.session}:${++this.sequence}`, matchId, botId, policy,
      observedAt: Date.now(), kind, auctionId: extra.auctionId ?? null,
      features: { rack: [...game.rack], balance: game.balance, score: extra.score, remaining: game.remaining,
        round: game.round ?? 0, totalRounds: game.totalAuctions ?? 0, players: game.players, auctionType: game.auctionType,
        offeredCounts: [...extra.offeredCounts], letter: extra.letter ?? null, deadlineMs: extra.deadlineMs ?? null,
        opponents: extra.opponents.map(o => ({ ...o })) } };
  }
  append(state: Omit<LiveDecision, 'action'>, action: LiveDecision['action']) {
    appendFileSync(`${this.directory}/${state.matchId}.jsonl`, JSON.stringify({ ...state, action }) + '\n', { mode: 0o600 });
  }
}
