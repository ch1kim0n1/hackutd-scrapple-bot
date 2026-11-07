import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const HOST = process.env.STDB_HOST ?? 'https://maincloud.spacetimedb.com';
export const DATABASE = process.env.STDB_DB ?? 'scrabblebot';
export const BOT_ID = BigInt(process.env.BOT_ID ?? '166');
export const SECRET_PATH = resolve('.secrets/bot-token');
export function loadToken(): string | undefined {
  return process.env.BOT_TOKEN ?? (existsSync(SECRET_PATH) ? readFileSync(SECRET_PATH, 'utf8').trim() : undefined);
}
export function saveToken(token: string): void {
  mkdirSync(resolve('.secrets'), { recursive: true, mode: 0o700 });
  chmodSync(resolve('.secrets'), 0o700);
  writeFileSync(SECRET_PATH, token, { mode: 0o600 });
  chmodSync(SECRET_PATH, 0o600);
}
