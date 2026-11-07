import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { DATABASE, HOST } from './config.js';
import { wordScore } from './letters.js';

const execute = promisify(execFile);
export type Raw = Record<string, any>;
export interface HistoricalMatch {
  id: number; createdAt: number; endedAt: number; rackSize: number; durationMs: number; auctionType: 'Vickrey' | 'FirstPrice';
  participants: { botId: number; score: number; balance: number }[];
  auctions: { id: number; letter: string; winner?: number; paid: number; topBid?: number; at: number; opensAt?: number; remaining: number }[];
  plays: { id: number; botId: number; word: string; reward: number; at: number }[];
}
export interface RankedBot { botId: number; name: string; rating: number; spread: number; versionStartedAt: number; matchesPlayed: number; wins: number }
export const queries: { at: string; sql: string; rows: number }[] = [];
export async function sql(query: string): Promise<Raw[]> {
  const { stdout } = await execute(process.env.SPACETIME_CLI ?? `${homedir()}/.local/bin/spacetime`,
    ['sql', '--server', HOST, '--format', 'json', DATABASE, query], { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
  const [result] = JSON.parse(stdout);
  const fields = result.schema.elements.map((e: Raw) => e.name.some);
  const rows = result.rows.map((r: unknown[]) => Object.fromEntries(fields.map((name: string, i: number) => [name, r[i]])));
  queries.push({ at: new Date().toISOString(), sql: query, rows: rows.length });
  return rows;
}
export function option(value: any): any { return Array.isArray(value) && value[0] === 0 ? value[1] : undefined; }
export function timestamp(value: any): number { return Number(Array.isArray(value) ? value[0] : value) / 1000; }
const scale = 400 / (Math.log(10) * (25 / 6) * Math.SQRT2);
export function rankBots(bots: Raw[], stats: Raw[], versions: Raw[]): RankedBot[] {
  const names = new Map(bots.map(b => [b.id, b.name]));
  return stats.filter(s => names.has(s.bot_id) && Math.round(scale * s.openskill_sigma) <= 175)
    .map(s => ({ botId: s.bot_id, name: names.get(s.bot_id), rating: Math.round(1500 + scale * (s.openskill_mu - 25)),
      spread: Math.round(scale * s.openskill_sigma), matchesPlayed: s.matches_played, wins: s.wins,
      versionStartedAt: Math.max(0, ...versions.filter(v => v.bot_id === s.bot_id).map(v => timestamp(v.started_at))) }))
    .sort((a, b) => b.rating - a.rating);
}
export function normalizeMatch(match: Raw, participants: Raw[], auctions: Raw[], results: Raw[], tops: Raw[], plays: Raw[]): HistoricalMatch {
  const sales = new Map(results.map(r => [r.auction_id, r]));
  const bids = new Map(tops.map(r => [r.auction_id, r.top_bid]));
  const ordered = auctions.sort((a, b) => timestamp(a.opens_at) - timestamp(b.opens_at) || a.id - b.id);
  return { id: match.id, createdAt: timestamp(match.created_at), endedAt: timestamp(option(match.ended_at)),
    rackSize: match.starting_rack_size, durationMs: match.auction_duration_ms, auctionType: match.auction_type[0] === 1 ? 'Vickrey' : 'FirstPrice',
    participants: participants.map(p => ({ botId: p.bot_id, score: p.score, balance: p.balance })),
    auctions: ordered.map((a, i) => { const result = sales.get(a.id); return { id: a.id, letter: a.letter,
      winner: result ? option(result.winner_bot_id) : undefined, paid: result?.paid ?? NaN,
      topBid: bids.get(a.id), at: result ? timestamp(result.closed_at) : NaN, opensAt: timestamp(a.opens_at), remaining: ordered.length - i - 1 }; }),
    plays: plays.map(p => ({ id: p.id, botId: p.bot_id, word: p.word, reward: p.total_reward, at: timestamp(p.played_at) }))
      .sort((a, b) => a.at - b.at || a.id - b.id) };
}
export function validateMatch(match: HistoricalMatch): string[] {
  const errors: string[] = [];
  const ids = match.participants.map(p => p.botId);
  if (new Set(ids).size !== ids.length) errors.push('duplicate participant');
  if (new Set(match.auctions.map(a => a.id)).size !== match.auctions.length) errors.push('duplicate auction');
  if (new Set(match.plays.map(p => p.id)).size !== match.plays.length) errors.push('duplicate word play');
  if (!match.endedAt || match.endedAt < match.createdAt) errors.push('invalid match times');
  const expected = 98 - match.rackSize * ids.length;
  if (match.auctions.length !== expected) errors.push(`auction coverage ${match.auctions.length}/${expected}`);
  for (const p of match.participants) {
    const reward = match.plays.filter(w => w.botId === p.botId).reduce((n, w) => n + w.reward, 0);
    const spent = match.auctions.filter(a => a.winner === p.botId).reduce((n, a) => n + a.paid, 0);
    if (reward !== p.score) errors.push(`score mismatch for ${p.botId}`);
    if (100 - spent + p.score !== p.balance) errors.push(`balance mismatch for ${p.botId}`);
  }
  for (const a of match.auctions) {
    if (!Number.isFinite(a.paid) || a.paid < 0 || !Number.isFinite(a.at)) errors.push('missing/invalid sale');
    if (a.winner !== undefined && !ids.includes(a.winner)) errors.push('sale orphan');
    if (a.topBid !== undefined && a.topBid < a.paid) errors.push('payment exceeds top bid');
    if (a.at < match.createdAt || a.at > match.endedAt) errors.push('auction outside match');
  }
  for (const w of match.plays) {
    if (!ids.includes(w.botId)) errors.push('word orphan');
    if (wordScore(w.word) !== w.reward) errors.push('invalid word reward');
    if (w.at < match.createdAt || w.at > match.endedAt) errors.push('word outside match');
  }
  return [...new Set(errors)];
}
