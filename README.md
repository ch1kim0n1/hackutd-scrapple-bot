# SoapConsumers / hackutd-scrapple-bot

A local TypeScript bot for [ScrabbleBot](https://scrabblebot.spacetimedb.com/), registered as bot **166** on team **SoapConsumers**.

## Run

```sh
npm install
npm run check
npm test
npm start
```

The existing credential is kept in `.secrets/bot-token`, with directory mode 700 and file mode 600. It is ignored by Git. Do not share this file or put the token in a command line, screenshot, or commit. `npm run provision` can mint a credential using an already signed-in SpacetimeDB CLI; it leaves an existing local credential in place.

For a process that keeps running after the terminal command returns:

```sh
npm run start:background
npm run status
npm run stop
```

The bot runs on this computer and needs it awake and online. It reconnects with backoff after disconnects, recovers an existing match from subscriptions, and rejoins the lobby after each match. Background mode does not install a login item or cloud service. Run only one copy for this bot identity.

## Strategy

- Search the full ENABLE dictionary through a trie; retain one spelling per anagram multiset.
- Compare combinations of words, including shorter plays that earn more together. Search is bounded on large racks to keep auctions responsive.
- Value a new letter by its immediate liquidation gain and likely one- or two-letter completions. Account for repeat letters, vowel balance, the remaining bag, opponents, auction type, and observed prices.
- Read public bot metadata for simulated rivals. When the whole opposing table is simulated, cap bids at one above their source-derived maximum; mixed or unknown tables keep normal valuation.
- Preserve a declining cash reserve across the match instead of spending the starting bankroll for an early lead. Bank seven-letter word rewards until the late buying window, then release cash inside the final 16 auctions with archive-calibrated vowel/consonant floors. A short-word completion cannot bypass that reserve; a seven-letter payout can fund its own purchase.
- Build toward the full seven-letter multiplier while funds and time permit. Choose word sales with the remaining rack's usefulness in mind, sell earlier when funds run low, and liquidate before the match ends.
- Stop word-allocation search when its shared state budget is exhausted. Returning a legal bounded plan keeps large-rack searches within the auction window.
- Do not bid on the final tile: in the inspected game code, its auction and match end happen in the same transaction, leaving external bots no time to use it.

`src/strategy.ts` contains the policy; `src/planner.ts` contains word allocation; `src/main.ts` handles live events. No language-model API is used.

The client uses only the bot's own private rack and public auction/word events. It does not open a spectator identity to access winning bids hidden from bot credentials.

## Verification and results

```sh
npm test
npm run benchmark
GAMES=24 npm run simulate
GAMES=24 OPPONENTS=patient npm run simulate
GAMES=24 OPPONENTS=server npm run simulate
GAMES=24 OPPONENTS=aggressive npm run simulate
GAMES=12 OPPONENTS=strategic npm run simulate
GAMES=20 POLICIES=v8,v9 PROFILE_OBS=200 npm run replay
GAMES=32 SEED_OFFSET=102000 node --import tsx scripts/upgrade-benchmark.ts
GAMES=16 SEED_OFFSET=105000 OPPONENTS=aggressive node --import tsx scripts/upgrade-benchmark.ts
```

The simulator implements six clients, five starting tiles each, the standard bag, random auction ties, Vickrey payments, integer word rewards, unsold tiles discarded, and no final-tile grace period for external clients. It is an approximation for strategy development, not a replacement for the server test harness or live results. Server mode also reproduces the public simulated-bot pool, bid jitter, and sim-only word play after auction wins. The starter comparison uses longest-word play and face-value bidding; the patient comparison holds short words. Aggressive opponents also bid more, roughly twice face value plus four. Strategic opponents use the frozen pre-v5 strategy. The observed mode combines three historical leader models, the frozen strategy, and an aggressive bidder. These models do not reproduce the leaders' private racks or actual code.

The replay command replays policies through our own archived live matches using recorded starting racks, public top bids, actual opponent outcomes, and tie-loss/tie-win bounds. It is slower than synthetic simulation but better measures counterfactual live behavior.

The upgrade benchmark compares the frozen pre-v5 strategy (`src/legacy-strategy.ts`) and the current strategy on the same deals with unchanged opponent policies. It retains final score, placement, wins, and score gained after round 40 in `data/upgrade-*.json`. Older `data/simulation-*.json` records describe earlier policies and easier opponents; their win rates are not estimates of live strength.

Final v5 validation, observed-model seeds 102000–102031: mean score **72.84 → 78.63**, mean placement **2.47 → 1.88**, simulated wins **8/32 → 15/32**, and points earned after round 40 **6.16 → 26.06**. A separate aggressive-opponent check on seeds 105000–105015 retained **16/16** simulated wins, with mean score **170.25 → 178.94**. Type checking and all **24 tests** passed. The eight-rack latency benchmark, including oversized stress racks, measured median **103 ms**, p95 **274 ms**, and maximum **459 ms** after tightening search; measured timings depend on machine load. These are development checks, not evidence of a live winning streak.

Initial live trials were much harder than starter simulations: the first match finished second on 81 points against a 309-point winner, and subsequent early-policy matches exposed underinvestment in tiles. Those results prompted the stronger acquisition policy in v3. Live outcomes are recorded separately in the bot log; simulator wins do not establish dominance over live competitors.

## Continuous learning

```sh
npm run research           # refresh current leaders and completed-match evidence
npm run learn:once         # collect, screen, validate, and possibly promote one generation
npm run learn:background   # repeat after a 15-minute wait between cycles
npm run learn:stop
npm run status
```

The bot and learner run as separate local processes. Every completed SoapConsumers game is retained under `data/learning/self/`, including losses. Records include final score, placement, purchases, balance, leftover playable value, bid decisions, and diagnostic flags. The collector backfills previous SoapConsumers matches and a stratified sample of older games from the current top three. Missing private information in older records stays unknown. Raw validated match archives are retained under `data/learning/matches/`; a bounded recent/reservoir dataset feeds the models.

The growing learning archive is local and ignored by Git. The source code and collection scripts are separate from that runtime data.

The leaderboard is reconstructed using the site's OpenSkill scale and provisional eligibility rule. Profiles currently cover LUCENT, Bron, and Waupus. They use public auction results, winning bids published after matches end, and words played. Opponents' starting letters and losing bids are unknown. Waupus's latest observed game was October 25, 2026, so its behavior is historical rather than a fresh live-policy observation. Recent and older records are checked for unique keys, complete auctions, correct rewards, score/balance reconciliation, and event timing. Bot-version boundaries are preserved.

The learner approximates the leaders' buying and word-timing behavior, then proposes bounded parameter changes from those profiles and our losses. It separates training and holdout match records before constructing models, screens candidates on 12 seed games, and evaluates only the selected candidate on 20 different seeds using held-out opponent profiles. A positive conservative lower bound on paired fitness improvement and an aggressive-opponent sanity check are required before automatic promotion. Fitness combines placement and score. This gate tests improvements against behavioral approximations; it cannot prove superiority against the actual leaders.

Validated parameters are written atomically to `.run/champion.json` and loaded between matches. A previous champion is retained. The learner can roll back after sustained degradation across enough live games with the same table composition and game defaults. Market observations persist across process restarts. Full evaluation records, rejected candidates, seed sets, and promotion decisions are retained in `data/learning/evolution.jsonl`.

An empty-rack edge case was fixed after live-loss review: empty racks now have a neutral vowel ratio, so fresh consonants are not discounted as if the rack already contained too many consonants. Later review showed repeated early leads followed by low cash and almost empty racks around round 40. `sustainable-v5` is the new manual baseline, with a declining capital reserve, seven-letter payout preference, rack-leave valuation, and stricter search bounds. The learner can test reserve size along with bidding and timing parameters. These mechanisms support continued improvement; they do not establish an optimal or perfect strategy.

The user requested website **v2 after two new live wins**. `.run/version-plan.json` records that condition. Once two distinct, valid completed wins after the request are archived, the client checks the current website version through the owner's CLI identity, starts v2 once, and verifies the result. Previous wins do not count. The old version and its match history remain available; the new rating starts fresh. This website version is separate from internal policy revisions such as `adaptive-v4`.

Logs are JSON lines in `logs/bot.jsonl`; `.run/status.json` records the current process and active matches. Logs and runtime state are ignored by Git. Credentials are never included in the application logs.

## ML dataset recording

`npm run dataset:background` records all accessible completed public games in a
separate uncapped archive and follows new games. Our live client also journals
its private rack, decision inputs, actions, and submission results. Export a
versioned training snapshot with `npm run dataset:export`; it includes numeric
features, missing-value masks, outcomes, and whole-match chronological splits.
See [TRAINING_DATA.md](TRAINING_DATA.md) for the schema, loader, and coverage limits.

## Sources

Upstream code and generated bindings: [clockworklabs/scrabblebot](https://github.com/clockworklabs/scrabblebot), commit `b5ccb36aa238ad16692f8d6af54da15ef9f11324`; MIT notice in `LICENSE.upstream`. `data/enable.txt` is its shared ENABLE word list. `data/server-schema.json` is the public live schema fetched during setup. Extracted rules, reducer, visibility, scoring, and simulated-bot notes live in [docs/website-reference.md](docs/website-reference.md).

The upstream guide has stale details: the inspected source uses 90-second lobbies, discards unbid tiles, deals private starting tiles, and hides live winning bids from bot credentials. Game defaults can be changed by the server administrator, so the client reads each match's actual values.
## Repository

`hackutd-scrapple-bot` remote main merged here; remote initially contained only its placeholder README.
