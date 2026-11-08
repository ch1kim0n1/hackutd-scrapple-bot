# ScrabbleBot website reference

Extracted from `web-source/scrabblebot` before deleting that directory. This file preserves the parts needed by the bot; generated bindings remain under `src/module_bindings/`.

## Core rules

- Starting balance: `100` coins.
- Starting rack: `5` private tiles per participant.
- Shared bag: standard Scrabble distribution, `98` tiles, no blanks.
- Lobby defaults: `6` bots, one open lobby; timeout `90` seconds in server code. Empty slots are filled with idle simulated bots.
- Auction duration: `1000 ms` by default.
- Minimum payment/reserve: `1` coin.
- Auctions are sealed. `pending_bid` is private.
- One auction is open per match. The tile is removed from the bag when the auction opens.
- Match ends when `bag_total` reaches `0`.
- The final auction cannot produce a playable tile: the match closes atomically after it resolves.
- Tiles that receive no bid are **not redrawn**. They are recorded as unsold and are out of circulation for the match. The public bot guide says “returned to the bag,” but server code treats each auctioned tile as consumed.

## Letter values

`A,E,I,O,U,L,N,S,T,R = 1`; `D,G = 2`; `B,C,M,P = 3`; `F,H,V,W,Y = 4`; `K = 5`; `J,X = 8`; `Q,Z = 10`.

Bag counts:

`A9 B2 C2 D4 E12 F2 G3 H2 I9 J1 K1 L4 M2 N6 O8 P2 Q1 R6 S4 T6 U4 V2 W2 X1 Y2 Z1`

## Word scoring

- Base score: sum of tile values.
- Length `<=3`: `1x`
- Length `4`: `1.5x`
- Length `5`: `2x`
- Length `6`: `2.5x`
- Length `>=7`: `3x`
- Reward uses integer division/floor.
- Reward adds equally to `score` and spendable `balance`.
- Played letters are removed from the private rack.

## Auction resolution

For each auction:

1. Drop bids `<=0`.
2. Shuffle remaining bids, then stable-sort descending.
3. Random tie winner among equal top bids.
4. `FirstPrice`: winner pays own bid.
5. `Vickrey`: winner pays second-highest bid; if only one positive bid exists, winner pays `min(1, topBid)` = `1`.
6. Winner pays only if current participant balance covers payment; then tile joins rack.

Top bids are hidden during live matches. `auction_top_bid_archive` exposes them after match end only; safe for offline replay, not live strategy.

## Simulated bot formulas

Sim jitter: integer `-2..+2`, inclusive.

`decideBid(strategy, letter, balance, jitter)`:

- `Human`: `0`
- `Cheapskate`: `letterValue - 1 + jitter`
- `ValueBidder`: `letterValue + jitter`
- `Aggressive`: `letterValue + 4 + jitter` for vowels, `letterValue + 2 + jitter` for consonants
- Clamp to `[0, balance]`; if base is below `1`, minimum positive bid is `1`.

After a simulated bot wins a tile, it immediately plays `findBestPlayable(rack, minLength=3)` when available.

## Public/private data

Useful public tables/views:

- `bot`: bot id, name, `is_simulated`, strategy, team id
- `bot_credential`: identity ↔ bot mapping and connected state
- `lobby`, `lobby_member`, `open_lobbies`, `open_lobby_members`
- `match_state`: status, round, `bag_total`, auction type/duration, rack size, timestamps
- `match_participant`: `bot_id`, `score`, `balance`
- `auction`: match id, letter, open/close timestamps, status
- `auction_result`: winner, paid, close time
- `word_play`: bot, word, base score, bonus, total reward, time
- `bot_stats`, `rating_history`, `bot_version`, `retired_bot_stats`
- `auction_top_bid_archive`: top bids after match end

Private/restricted data:

- `pending_bid`: sealed live bids; do not try to read
- `holding`: private racks; `my_rack` exposes only own bot’s rack
- live `auction_top_bid`: spectator-only and unsafe/unavailable for competing bots

## Reducers used by bot

- `join_lobby()`: enter current lobby
- `submit_bid(auction_id: u64, amount: i64)`: replace/submit sealed bid
- `submit_word(match_id: u64, word: string)`: play valid dictionary word
- `start_new_bot_version()`: website version reset; moves current stats to retired stats
- `register_for_tournament(tournament_id)` / `unregister_for_tournament(tournament_id)`

Useful CLI examples:

```bash
spacetime call --server https://maincloud.spacetimedb.com scrabblebot start_new_bot_version
spacetime sql --server https://maincloud.spacetimedb.com --format json scrabblebot \
  "select * from bot_version where bot_id = 166"
```

## Ratings and versions

- Server records Elo-style `rating` plus OpenSkill `mu/sigma`.
- OpenSkill uses Plackett-Luce over the whole free-for-all result.
- Tied scores share finishing place; tied leaders all count as wins.
- Leaderboard display scales OpenSkill to approximately Elo-like `1500`.
- New version starts current stats fresh; old stats move to `retired_bot_stats`.
- Match counts for website version current at match `created_at`, even if version changes mid-match.
- Internal policy names such as `sustainable-v10` are unrelated to website versions.

## Dictionary

- Local `data/enable.txt` is byte-identical to extracted server `wordlist.txt`.
- `172,820` lines.
- SHA-256: `b819e7b67f8f2c80640ae76f0edbe59a4a1befb6de0f348463642ad49bdd2ad3`

## Operational implications for strategy

- Cash and word inventory both matter; word rewards are reusable auction money.
- Late cash has zero terminal value, but unsold auctions never repeat.
- Unknown humans must not be modeled as exact simulated bots.
- Exact sim caps are legal only when every opponent publicly reports `isSimulated`.
- Post-match top bids can calibrate/replay; they cannot inform live bids.
- Strong opponents buy earlier, preserve playable rack inventory, and use late auctions for targeted completions rather than broad tile volume.

## Tournament notes

- Bot itself must call register/unregister; website account cannot.
- Swiss points use finishing place; ties share place.
- Bracket eliminates last place; total tournament score then bot id breaks ties.
- Final uses three games and cumulative score.
- Offline registered bot is still seated and loses auctions it does not bid in.
