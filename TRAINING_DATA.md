# ML training dataset

The collector retains every accessible completed public match, without the
500-game cap used by the strategy learner. Our bot additionally records its
actual private observations and decisions. Wins, ties, losses, and idle bots
are retained; the archive is not filtered to successful plays or leaders.

## Files and commands

- `data/training/games.sqlite`: growing compressed raw archives, normalized
  games, generated examples, provenance, quality results, and a server catalog.
- `data/training/live/<match-id>.jsonl`: append-only private decision journals.
- `data/training/collection.jsonl` and `queries.jsonl`: ingestion and SQL audit logs.
- `data/training/exports/<timestamp>/`: immutable gzip JSONL training snapshots.

```sh
npm run dataset:background   # resume history backfill, then follow new games
npm run dataset:stop
npm run dataset:once         # one full catch-up, then stop
npm run status
npm run dataset:export       # snapshot all currently valid games
npm run dataset:export -- --private  # separate corpus of exact live private decisions
python3 scripts/read-training.py data/training/exports/<timestamp> --split train --limit 1
python3 scripts/validate-training.py data/training/exports/<timestamp>
```

Collection runs as a separate low-priority process. SQLite uses WAL, and the
bot appends its observations to separate journal files so a database write
cannot hold up an auction. Backfill is resumable and keyed by match ID. Raw
records that fail reconciliation are kept in quarantine and excluded from
training exports. Incoming games and late bid enrichment update the database;
existing exported snapshots keep their original membership and content.

The bot and collector need this computer awake and online. If the bot was
offline, public history can be recovered; unrecorded private observations and
unknown losing bids cannot be recovered. The server currently exposes only
part of its historical ID range. Collection covers accessible records, not
deleted or inaccessible games.

## Example types and features

Every example has `matchId`, `botId`, `kind`, `provenance`, `policy`,
`observedAt`, `features`, `action`, `targets`, and a **91-number** feature
vector `x` with a matching `xMask`. The feature order is in each export's
`manifest.json` and `src/training.ts`. Zero with mask 0 means unknown; zero
with mask 1 means an observed zero. Scaling uses fixed game units rather than
statistics computed from validation/test outcomes.

| Kind | State and action coverage |
| --- | --- |
| `own_bid` | Live rack counts A–Z, funds, score, round, bag size, previous offers, public opponent states, offer, time left, proposed amount, submission result |
| `own_word` | The same private/public state, chosen word or deliberate hold, submission result |
| `public_bid` | One row per participant per auction, with public state strictly before the auction opens; winning bid known only when published in the completed archive |
| `public_word` | Public state strictly before a recorded word play, the actual word, and reward; private rack letters remain unknown |
| `legacy_own_bid` | Previously logged rack/balance/action; unavailable timestamp and synchronized state remain unknown/masked |

Targets include final score, placement, top finish, whether first place was
shared, ending funds, score still to be earned, auction outcome/prices, and
immediate word reward. Targets and chosen actions are kept out of `x`.
Live timestamps use the client's clock; historical events use server time.
Historical states exclude events at the exact same timestamp rather than
inventing their internal order.

`bidAmountKnown` distinguishes archived winning bids from unobserved bids.
The winning bids are a selected sample, not everyone's bidding distribution.
Do not turn missing bids into zero bids. For imitation of our private-state
policy, use `own_bid`/`own_word`, require `accepted=true` and status
`submitted` or `abstain`, and treat repeated bid revisions as decisions in the
same auction. Failed, expired, and unchanged submissions are retained for
diagnostics. Historical partial traces remain a separate kind and are not
duplicated when a new live bid journal covers that auction.

## Snapshots and integrity

Each export uses a consistent SQLite read snapshot and orders whole matches
by completion time and ID: oldest 80% train, next 10% validation, newest 10%
test. All participants and decisions from one match stay in the same split.
The manifest lists match IDs, source-content hashes, exact feature order,
row counts, shard filenames, and SHA-256 hashes of uncompressed shard content.
New exports are new dataset versions, so freeze a manifest before choosing
hyperparameters or reporting model performance.

The `--private` view splits only games with exact live private observations,
then exports their `own_bid` and `own_word` decisions. This lets a private-state
policy use an appropriate chronological cohort as new observations accumulate;
in the all-history view, newly recorded private games initially sit in the newest
test period. These are separate experiment datasets. Do not combine split names
from different manifests: if training across sources, use the all-history
manifest's common match assignments. Small new private corpora may have empty
validation partitions and are not yet enough to evaluate a neural policy.

The tests check score/payment reconciliation, missing auctions, duplicate
ingestion, quarantine preservation, unknown-bid masks, frozen live inputs,
future-outcome leakage, tied timestamps, and match-level chronological splits.
Raw SQLite data and exports are local and ignored by Git. They contain no
authentication tokens. The implementation records data for later ML work;
training or deploying a neural network is a separate step.
