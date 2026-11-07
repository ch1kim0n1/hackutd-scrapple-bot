# Scrabble AI rack valuation and transfer to a boardless letter-auction game

Scope: how top Scrabble engines (Maven, Quackle, Macondo/BestBot, Wolges, Heuri) value leaves and racks; published numeric tables; bingo-stem statistics; imperfect-information methods; expert rack management; fast completion-probability computation; adjacent letter-buying games. The target game has no board, so only rack composition matters. Reward = floor(sum of Scrabble tile values x length multiplier), with 7+ letters paying x3. The bag has 98 tiles and no blanks, and the dictionary is ENABLE.

Where the notes say "own computation", the numbers come from scripts run in this research session against the repo's `data/enable.txt` (172,820 words) with the 98-tile no-blank distribution A9 B2 C2 D4 E12 F2 G3 H2 I9 J1 K1 L4 M2 N6 O8 P2 Q1 R6 S4 T6 U4 V2 W2 X1 Y2 Z1. Those scripts were scratch files and were not kept in the repo; the method is described inline so it can be reproduced.

## 1. Maven (Sheppard): leave evaluation, training, and what simulation added

### Takeaway
Maven uses Evaluation = Score + Rack + Position. It treats Position as about 0, except access to triple-word squares, which is worth under ~3 points. It learned its Rack (leave) term by self-play feedback, going from zero knowledge to beyond human-champion level in one day of training. It then added Monte Carlo "simulation" (statistical lookahead) on top of the static evaluator, plus B* search for the endgame. For a boardless game, the Score + Rack decomposition and the self-play-trained leave table carry over directly. The Position term does not apply, and Sheppard had already found it close to zero.

### Cited Findings
- Sheppard frames move evaluation as "Evaluation = Score + Rack + Position". He found the Position term "usually very close to 0", because the board is a shared resource and openings cancel out. The one exception is direct access to triple-word squares, which "is only worth a few points (usually under three)". — [Sheppard essay on Maven (course copy, pdx.edu)](https://web.cecs.pdx.edu/~bart/cs510games-summer2002/papers/maven.pdf)
- For the Rack term, Sheppard used "self-play to generate games and 'feed back' the impact of holding specific tiles into the evaluation function". He reports that "the evaluation function improved from zero initial knowledge to beyond the level of the human champions of the day, while using only a single day of training." — [Sheppard essay (pdx.edu)](https://web.cecs.pdx.edu/~bart/cs510games-summer2002/papers/maven.pdf)
- Sheppard warns that self-play brings "greater internal consistency", but that missing computational processes are found only by comparing against human experts. He also found that score-dependent play, opponent skill, and board opening/blocking were insignificant "compared to Maven's skill in scoring points and keeping good tiles." — [Sheppard essay (pdx.edu)](https://web.cecs.pdx.edu/~bart/cs510games-summer2002/papers/maven.pdf)
- Simulation, which Sheppard calls "statistical lookahead", evaluates moves "by 'playing them out' at high speed", picks the highest average outcome, and prunes moves proven inferior. Sheppard claims Maven was the first program to use statistical lookahead to play games. — [Sheppard essay (pdx.edu)](https://web.cecs.pdx.edu/~bart/cs510games-summer2002/papers/maven.pdf)
- Endgame: with no tiles in the bag the game is deterministic, but a static evaluator fails. Maven used B* search with a budget of about 120 nodes, because move generation took about 1 s on the hardware of the day and the endgame branching factor averages about 200. "Stuck with Q" endgames can last 14 plies. — [Sheppard essay (pdx.edu)](https://web.cecs.pdx.edu/~bart/cs510games-summer2002/papers/maven.pdf)
- Formal reference: B. Sheppard, "World-championship-caliber Scrabble", *Artificial Intelligence* 134(1–2):241–275, 2002, doi:10.1016/S0004-3702(01)00166-7. ScienceDirect returned HTTP 403 to automated fetch, so the full text was not read. — [Wikipedia: Maven (Scrabble)](https://en.wikipedia.org/wiki/Maven_(Scrabble))
- Quackle's Monte Carlo simulation "works the same as Maven's". At a 2006 human-vs-computer event Quackle finished first, two games ahead of Maven. — [Wikipedia: Maven (Scrabble)](https://en.wikipedia.org/wiki/Maven_(Scrabble)) (via search-result summary)
- Measured value of a leave term over pure greed: in Richards & Amir's experiments, a greedy (score-only) player lost to a static score+leave player by about 47 points per game. The static leave player beat Quackle by about 30 points per game in their setup. — [Richards & Amir, IJCAI 2007](https://www.ijcai.org/Abstract/07/239) ([PDF](https://ijcai.org/proceedings/2007/0239.pdf))
- Wolges reports that a null leave table (every leave = 0, i.e. greedy) wins only about 37.5% of games against a self-play leave table, measured over one million mirrored game pairs. — [wolges lab/leavegen.txt](https://github.com/andy-k/wolges/blob/main/lab/leavegen.txt)

### Inferences
- In the auction game a "move" is either buying a tile or cashing a word. The analogue of Score + Rack is: value of a candidate letter = (best immediate cash-out value with the letter) + (leave value of what remains), compared with the same quantity without the letter. The leave term is the large lever: in Scrabble, dropping it costs about 12.5 percentage points of win rate (37.5% vs 50%) and about 47 points per game.
- Sheppard's finding that Position is about 0 suggests a boardless game loses little strategic depth in the static evaluator. Almost all of the evaluator's power is in score + rack, so a strong boardless leave table should capture most of what made Maven strong.

### Gaps
- The AIJ paper's exact rack-evaluator parameterisation was not verified, because its full text was blocked (403). That includes any per-tile values, duplication, vowel/consonant terms, QU synergy, the number of parameters, and the measured points-per-game gain of simulation over static play. A search summary claimed "a linear evaluator per rack, 5 parameters per rack, ~15 million parameters", but I could not confirm this against the primary text, so treat it as unverified.

## 2. Quackle, Macondo/BestBot, Wolges: how leave values are computed, plus published per-tile numbers

### Takeaway
All modern engines use an exhaustive table of every 1–6-tile leave (a "superleave" or KLV table), learned from self-play or exact per-board census, and add it to the move score. Quackle ships its tables as files in its repository; numbers are below. A blank is about +22 to +26, S about +7 to +8, Q about -7 (QU together is a small positive), and U/V/W are strongly negative. Duplicates are penalised heavily (UU -18.8, II -11.7, OO -11.3; SS is the exception at +11.3). Six-tile leaves average best at 2 vowels, at -4.8 versus -20.2 with 0 vowels and -36.7 with 6. Board-driven values, such as Z and X being positive and H/C being positive, do not transfer to a boardless game.

### Cited Findings
**Quackle**
- Quackle's static evaluation is equity = play score + leave value, looked up in "a large precomputed database of all possible one to six letter leaves". Values reward leaves that did well in "a large sample of Quackle versus Quackle games". The doc's examples are ER +4.79, ERR +0.39, ERRR -9.02, EQZ -4.12, EQYZ -4.68. — [How Quackle plays Scrabble](https://people.csail.mit.edu/jasonkb/quackle/doc/how_quackle_plays_scrabble.html)
- Quackle's simulation keeps the top 23 static plays. Each iteration (about 300 iterations per candidate) runs: the opponent draws 7 random tiles and makes its best static play, the player redraws and makes its best static play, then the leave value is added. Positions are converted to win% with a table indexed by spread and tiles unseen, built from Quackle-vs-Quackle games. Example: -82 points with 66 tiles unseen gives 0.206. — [How Quackle plays Scrabble](https://people.csail.mit.edu/jasonkb/quackle/doc/how_quackle_plays_scrabble.html)
- Quackle loads five strategy files per lexicon: `syn2` (pair synergies), `worths` (single-tile values), `vcplace`, `bogowin` (win table indexed by lead+300 and unseen tiles), and `superleaves`. The superleaves file is binary. Each record is a leave length byte, letter bytes (blank = 1, A = 5), and a 16-bit fixed-point value decoded as value = (hi*256 + lo)/256 - 128. — [quackle/strategyparameters.cpp](https://github.com/quackle/quackle/blob/master/strategyparameters.cpp); [alphabetparameters.h](https://github.com/quackle/quackle/blob/master/alphabetparameters.h)
- **Quackle `default_english/worths`** (single-tile values, verbatim from the file): ? +21.78, S +6.78, Z +4.82, X +3.10, E +1.09, H +1.03, A +0.85, C +0.74, M +0.63, D +0.58, R +0.51, N -0.16, T -0.20, L -0.37, I -0.46, O -0.55, P -0.58, K -0.92, Y -0.98, B -1.86, F -2.09, J -2.51, G -2.85, U -3.05, W -3.91, V -5.11, Q -7.54. — [quackle data/strategy/default_english/worths](https://github.com/quackle/quackle/blob/master/data/strategy/default_english/worths)
- **Quackle `default_english/syn2`** (pair synergies, verbatim):
  - Duplicates: ?? -13.63, SS -5.86, RR -5.55, NN -4.91, CC -4.77, UU -4.73, TT -4.55, DD -4.43, II -4.34, LL -4.34, YY -4.27, HH -4.06, AA -3.82, MM -3.71, EE -3.08, VV -2.95, OO -2.67, GG -2.54, WW -2.51, PP -2.41, BB -1.71, FF +1.30.
  - Strongest positive pairs: QU +13.66, GN +3.47, CH +2.77, WY +2.49, CK +2.34, KY +2.26, HW +2.20.
  - Q with vowels: AQ +1.36, EQ -2.01, IQ -0.45, OQ -1.89. Q with the blank: Q? -2.73. — [quackle data/strategy/default_english/syn2](https://github.com/quackle/quackle/blob/master/data/strategy/default_english/syn2)
- **Quackle `default_english/superleaves`, decoded in this session** (914,624 entries: 27 one-tile, 373 two-tile, 3,509 three-tile, 25,254 four-tile, 148,150 five-tile and 737,311 six-tile leaves):
  - One-tile: ? +25.57, S +8.04, Z +5.12, X +3.31, R +1.10, H +1.09, C +0.85, M +0.58, D +0.45, E +0.34, N +0.22, T -0.10, L -0.17, P -0.46, K -0.54, Y -0.63, A -0.64, J -1.48, B -2.01, I -2.07, F -2.21, O -2.50, G -2.86, W -3.82, U -5.11, V -5.55, Q -6.79.
  - Pairs: ?? +44.85, ?S +37.42, SS +11.32, QU +1.21, ER +3.85; AA -8.43, EE -5.41, II -11.68, OO -11.34, UU -18.80, VV -14.54, GG -7.93, WW -10.20.
  - Triples: SSS +8.21, EEE -12.55, AAA -16.98, III -21.46, OOO -20.21, UUU -28.95.
  - Best no-blank leaves by length: 2-tile SZ +12.3, RS +11.9; 3-tile ERS +16.8, EST +14.6; 4-tile ERST +25.0, EPRS +21.3; 5-tile AERST +31.2, EIRST +28.7, EINST +28.4; 6-tile ACEHRS +40.7, AEHRST +39.1, EIPRST +38.5, AENRST +37.2, EINRST +35.4, AEINST +35.3, AEIRST +33.4; AEINRT (RETINA) +27.5.
  - Mean value of 6-tile no-blank leaves by vowel count: 0 vowels -20.2, 1 vowel -10.2, 2 vowels -4.8, 3 vowels -7.4, 4 vowels -17.5, 5 vowels -30.1, 6 vowels -36.7. For 5-tile leaves: 0 vowels -14.5, 1 vowel -6.2, 2 vowels -3.9, 3 vowels -9.6, 4 vowels -21.2.
  - Source file and decoder: [quackle superleaves](https://github.com/quackle/quackle/blob/master/data/strategy/default_english/superleaves); decoded with the loader format in [strategyparameters.cpp](https://github.com/quackle/quackle/blob/master/strategyparameters.cpp)
  - Note: the doc's ER +4.79 differs from the shipped file's ER +3.85, so the doc reflects an older table. Which lexicon `default_english` was trained on is not stated in what I read.
- **Licence:** Quackle is "GNU General Public License ... version 3 ... or (at your option) any later version", copyright 2005–2026 Katz-Brown, O'Laughlin, Fultz. The data files sit in that GPL repository. — [quackle LICENSE](https://github.com/quackle/quackle/blob/master/LICENSE)

**Macondo / BestBot (Woogles)**
- BestBot's leave values cover "every single possible leave from 1 to 6 letters long", generated by self-play of fast games "to the tune of hundreds of millions of games". Leaves from Gilles (Ortograf) beat BestBot's previous set about 50.3%; Woogles then replicated leaves "basically tied" with his. Equity is "a combination of score and leave". Simulation is at least 5 plies with Welch's t-test pruning. Pre-endgame (2–6 tiles in bag) plays out to the end; the endgame is exhaustive alpha-beta. BestBot wins about 56–57% against Quackle's Championship Player. — [Woogles: Mathematics and Algorithms behind BestBot (2025)](https://blog.woogles.io/posts/2025-05-04-the-mathematics-and-algorithms-behind-bestbot)
- Macondo needs a CSV of all 1–6-tile leave values, converted to `.klv2` with wolges `buildlex`. Since v0.6.0 (Mar 2023) it uses KWG/KLV files instead of the old gaddag/olv leave files. Macondo's repo has notebooks for generating and smoothing superleaves from self-play logs. — [Macondo manual: make leaves](https://domino14.github.io/macondo/manual/make_leaves_structure.html); [Macondo changelog](https://domino14.github.io/macondo/changelog.html); [Macondo notebooks (superleaves)](https://notebook.community/domino14/macondo/notebooks/superleaves/generate_superleaves)
- Macondo repository licence: GPL-3.0, per the GitHub API `license.spdx_id`. The repo's `data/strategy/default/` holds `winpct.csv` (507 KB) and pre-endgame JSON; I found no leaves CSV in the repository tree. — [domino14/macondo](https://github.com/domino14/macondo)

**Wolges (Andy Kurnia)**
- Wolges stores a value per whole leave because "Leave values do not add up tile by tile". Its example: a lone Q and a lone U are each burdens, but QU together is good. — [wolges lab/leavegen.txt](https://github.com/andy-k/wolges/blob/main/lab/leavegen.txt)
- Self-play pipeline: run autoplay, then `summarize` into per-rack (equity sum, count), then `generate`. A leave's value is the average best-play equity of the fuller racks containing it, weighted by how often each rack occurred and by the number of ways its extra tiles could be drawn. The table is shifted so the empty leave = 0, and leaves backed by fewer than 50 samples are smoothed from neighbours. The loop is iterated over generations. — [wolges lab/leavegen.txt](https://github.com/andy-k/wolges/blob/main/lab/leavegen.txt)
- Exact per-board **census** (recommended method):
  - On each sampled board, build a "play-value sheet": the best score for playing exactly each tile group.
  - For every full rack (5,379,616 sub-racks for 27 tile kinds and 7-tile racks), compute best = max over play/keep splits of (sheet score + current leave value).
  - Weight each rack by its draw probability from the unseen tiles and credit its value to every sub-rack it contains. A leave's value = sum(weighted rack value) / sum(weight).
  - Average over boards. The recipe "3x256,2048" means three generations of 256 boards, then one of 2048.
  - — [wolges lab/leavegen.txt](https://github.com/andy-k/wolges/blob/main/lab/leavegen.txt)
- Measured strengths (one million mirrored pairs; standard error about 0.035 percentage points):
  - Null table vs a self-play table: about 37.5%.
  - Board-sampling table vs the autoplay table: board sampling +2.1 percentage points.
  - A 50/50 blend of census and self-play tables beats both parents by about 0.1 percentage points (50.10–50.12% over five million pairs).
  - — [wolges lab/leavegen.txt](https://github.com/andy-k/wolges/blob/main/lab/leavegen.txt)
- Wolges licence: the LICENSE.txt text is the MIT permission grant ("Permission is hereby granted, free of charge..."), Copyright (C) 2020–2026 Andy Kurnia. GitHub's API reports NOASSERTION. — [wolges LICENSE.txt](https://github.com/andy-k/wolges/blob/main/LICENSE.txt)

**Other per-tile estimates**
- A CMU study (Andrew Thomas) simulated about 10 million Quackle games. It estimated Q as roughly a 5-point penalty, the blank as worth about 30 points, and each S about 10. — [CMU: Lucky letters (2012)](https://www.cmu.edu/piper/briefs/2012/february/lucky-letters.html) (via search summary)
- IEEE Spectrum reports that holding a Q lowers the holder's final score by about 4 points on average. — [IEEE Spectrum: Data mining Scrabble](https://spectrum.ieee.org/geek-life/tools-toys/data-mining-scrabble) (via search summary)
- NASPA's Valett is a tool for computing tile values for variants. — [NASPA wiki: Valett](https://www2.scrabbleplayers.org/w/Valett) (not read in depth)
- Cross-tables has a leave-value lookup whose values come from Quackle/Macondo creators. — [cross-tables leaves](https://cross-tables.com/leaves.php) (numbers not retrieved)

### Inferences
- **What transfers:**
  - Non-additivity: the leave must be keyed on the whole multiset, not summed per tile.
  - Duplication penalties: UU, II, OO and AA are strongly negative, and SS is the exception.
  - Vowel balance: about 2 vowels in a 6-tile leave, roughly one-third vowels.
  - Q is a burden without U.
  - S and the "RETAINS/SATIRE-family" letters (E, R, S, T, N, L, D, A, I) are positive bingo-synergy letters.
- **What does not transfer:**
  - The board-premium components: Z and X positive, H and C mildly positive, J around -1.5. These reflect hot spots and premium squares.
  - Quackle's absolute magnitudes, which include a 50-point bingo bonus and the chance of the opponent using openings.
  - Without a board, X, Z, J and Q only help through face value inside words. By the bingo-lift numbers in section 3 they are the four worst letters for completing a 7-letter word.
- The census algorithm is the closest fit for the auction game. In a boardless game the play-value sheet is board-independent: best reward for tile group G = max over ENABLE words that are a sub-multiset of G of floor(face sum x multiplier), possibly over multi-word splits. It can be computed once, offline, exactly. The remaining modelling choice is the acquisition model (which tiles you can expect to buy, at what price) in place of "draw from unseen". Iterating with the current leave table gives a boardless superleave table.
- Licensing: Quackle (GPL-3.0+) and Macondo (GPL-3.0) tables and code would impose GPL obligations if bundled or derived from. Wolges is MIT, so its code and tools could be reused with attribution. Any Scrabble-board leave table is also mis-specified for this game, so generating our own boardless table is both legally cleaner and more accurate.

### Gaps
- No published per-tile leave numbers for Macondo/BestBot or Wolges were retrieved. They ship tables as binary KLV2 or outside the repo, and cross-tables' page was not fetched.
- The meaning of Quackle's `vcplace` file (columns: start, length, consonant bits, value) was not documented in what I read. From the field names, it looks like a board-placement vowel/consonant heuristic, so likely non-transferable.
- Which lexicon Quackle's `default_english` superleaves were trained on is unknown.

## 3. Most bingo-prone stems and racks; bingo probability data

### Takeaway
Under this game's exact conditions (ENABLE, 98 tiles, no blanks), a random 7-tile rack contains a 7-letter word only about 7.5% of the time. The probability rises steeply with rack size, because the game has no 7-tile rack cap: 28% at 8 tiles, 53% at 9, 73% at 10, 86% at 11 and 94% at 12. The best 6-tile stem is AEINST (SATINE), completed by 23 of 26 letters and by about 96% of random draws. RETINA (AEINRT) is much weaker without blanks: 17 completers, 72%. S is the single most bingo-enabling letter, and Q, J, X and Z are the least.

### Cited Findings
- Own computation on ENABLE with the no-blank 98-tile bag: 19,131 bag-feasible 7-letter alphagrams (22,806 words) and 25,095 eight-letter alphagrams.
- Own computation: the 25 best 6-tile stems ranked by P(one draw from the 92 tiles not in the stem completes a 7-letter word):

  | Stem | Completing letters | P(complete) | 7-letter words |
  |---|---|---|---|
  | AEINST | 23 | 0.957 | 67 |
  | EENRST | 18 | 0.870 | 41 |
  | EERSTT | 18 | 0.859 | 31 |
  | ACELRS | 18 | 0.859 | 47 |
  | EGINRS | 20 | 0.848 | 43 |
  | AEPPRS | 17 | 0.837 | 24 |
  | AELSST | 19 | 0.837 | 31 |
  | ENORST | 17 | 0.837 | 29 |
  | ABERST | 16 | 0.826 | 36 |
  | DEENRS | 17 | 0.826 | 26 |
  | ENRSTU | 16 | 0.826 | 31 |
  | EIPRST | 17 | 0.826 | 37 |
  | AEERST | 20 | 0.815 | 50 |
  | AERSTT | 18 | 0.815 | 42 |
  | EGILNT | 17 | 0.815 | 26 |
  | EIMRST | 17 | 0.815 | 35 |
  | ACERST | 15 | 0.804 | 43 |
  | EILRST | 18 | 0.804 | 44 |
  | DEEIRS | 18 | 0.804 | 39 |
  | BDEIRS | 15 | 0.793 | 25 |
  | ACELST | 16 | 0.793 | 30 |
  | AEIRST | 18 | 0.793 | 69 |
  | AENRST | 18 | 0.793 | 54 |
  | EILNOS | 16 | 0.793 | 25 |
  | ACEHRS | 18 | 0.793 | 31 |

  Other stems: AEINRT (RETINA) 17 completers, 0.717; EINRST 18, 0.772; DEINRS 17, 0.772; ADEIRS 17, 0.739; EIRSST 16, 0.728; AEILRS 16, 0.674; AEINRS 16, 0.641; AEILNS 19, 0.620; AEILNT 11, 0.489; AEIRSS 12, 0.424. (P assumes the next tile is uniform over the 92 tiles not in the stem, ignoring tiles held by others.)
- Own computation, Monte Carlo: P(a random n-tile rack from the full 98-tile bag contains a 7-letter word), with the P of an 8-letter word in brackets:

  | Rack size | Samples | P(7-letter word) | P(8-letter word) |
  |---|---|---|---|
  | 7 | 200k | 0.0757 | — |
  | 8 | 60k | 0.283 | 0.038 |
  | 9 | 30k | 0.528 | 0.176 |
  | 10 | 15k | 0.733 | 0.385 |
  | 11 | 8k | 0.860 | 0.601 |
  | 12 | 5k | 0.937 | 0.772 |

- Own computation, per-letter bingo lift for a random 6-tile rack plus letter X (200k racks): P(the 7 tiles form a 7-letter word) = S 0.135, R 0.105, N 0.095, T 0.093, L 0.092, E 0.090, D 0.084, C 0.078, A 0.073, I 0.073, G 0.068, M 0.067, P 0.066, O 0.060, U 0.052, B 0.050, H 0.048, V 0.035, F 0.034, K 0.032, W 0.028, Y 0.027, Z 0.013, X 0.012, J 0.008, Q 0.007.
- Own computation, per-letter lift for a random 7-tile rack plus letter X (40k racks): P(the 8 tiles contain a 7-letter word) = S 0.416, R 0.353, L 0.328, N 0.323, T 0.319, D 0.306, E 0.305, C 0.292, A 0.271, M 0.268, I 0.263, G 0.260, P 0.257, O 0.238, B 0.222, U 0.220, H 0.212, F 0.180, V 0.177, K 0.176, Y 0.167, W 0.158, Z 0.128, X 0.124, Q 0.106, J 0.106. The baseline for 7 random tiles alone is 0.0745.
- Own computation, rewards: under this game's formula (3 x face sum for 7 letters), the draw-probability-weighted mean reward of a 7-letter alphagram is 29.9. Over alphagrams (unweighted) the median is 33, the 10th percentile 27 and the 90th percentile 48. The brief's "about 40" for a played 7-letter word is consistent with players selecting higher-value bingos.
- In TWL, AEINRST forms nine words, the most of any 7-letter alphagram. Wikipedia lists the most probable bingos, for example RETINAE/TRAINEE. — [Wikipedia: Bingo (Scrabble)](https://en.wikipedia.org/wiki/Bingo_(Scrabble))
- A strategy site ranks stems in SOWPODS: AEIRST first with 98 seven-letter extensions, AEINST second with 96, AEINRT fifth with 71. It also reports about 15.5% of random 7-tile racks (with blanks) contain a 7-letter word. These are the site's own figures, not independently verified. — [wordsohard: bingo stems](https://wordsohard.com/guides/scrabble-bingo-stems); [wordsohard: bingo probability](https://wordsohard.com/guides/scrabble-bingo-probability)

### Inferences
- The no-blank bag roughly halves the classic bingo rate: 7.6% here versus about 15% with blanks and a larger lexicon. Stems that rely on blanks (RETINA, SATIRE in SOWPODS) lose rank. AEINST, ACELRS, EGINRS (the ING stem) and S-bearing E/R/T stems lead.
- Unlimited rack size is the decisive structural difference from Scrabble. Holding 9–10 well-chosen tiles gives a 50–73% chance of a 7-letter word, and 18–39% of an 8-letter word, from random tiles alone; bought tiles are chosen, so the real chance is higher. The marginal value of a tile is therefore highest around rack sizes 6–9, where each added tile moves P(7+) by 20–25 percentage points.
- A rack that maximises P(7-letter word): about one-third vowels (2 of 6; consistent with Quackle's vowel-count means), at most one copy of each vowel, at least one S, and the remainder from {R, N, T, L, D, E, C}. Avoid U, V, W, Y, J, Q, X, Z unless their face value is cashed in a known word.
- Value of letter X to rack R can be approximated as P_bingo(R+X) - P_bingo(R) times E[bingo reward], plus the change in short-word liquidation value. The per-letter lift tables give a default prior when R is unknown or small.

### Gaps
- No published bingo-probability table exists for ENABLE with a no-blank bag; all numbers here are own computations, reproducible from the method notes above. The Monte Carlo standard error is about ±0.6 percentage points at n=7 and about ±0.7 percentage points at n=12.
- I did not compute 7-letter-stem to 8-letter completion tables, or exact (rather than Monte Carlo) rack probabilities.

## 4. Academic work on imperfect information, opponent modeling, Monte Carlo, ISMCTS and deep learning

### Takeaway
Bayesian inference of opponent racks from their plays (Richards & Amir 2007; Macondo's 2026 inference engine) gives small but significant gains: about +5 points per game and 51% vs 49% wins. Full knowledge of the opponent's rack is worth about +37 points per game. ISMCTS is the general framework for hidden-information games. Probability-heuristic engines without simulation (Heuri) reach championship level. Deep learning has so far only imitated simulation rankings (Agarwal 2019); I found no AlphaZero-style Scrabble result.

### Cited Findings
- **Richards & Amir (IJCAI 2007):**
  - Method: a Bayesian posterior over the opponent's leave, with P(leave | play) proportional to P(leave) x P(play | leave). The likelihood assumes the opponent picks its top static-evaluator play, and simulation samples opponent racks from this posterior.
  - Full-knowledge test: 127 games vs Quackle Strong Player, mean 438 vs 401 (+37 points per game, p < 1e-5).
  - Inference agent: 630 games, 324 vs 306 wins, mean 427 vs 422 (+5.2 points per game, p < 0.045).
  - About 60% of posterior mass fell on roughly 10 leaves.
  - Caveat: the paper's win table for the full-knowledge test appears inconsistent (87 + 61 ≠ 127).
  - — [IJCAI 2007 abstract](https://www.ijcai.org/Abstract/07/239); [PDF](https://ijcai.org/proceedings/2007/0239.pdf)
- **Macondo rack inference** (rangefinder; the docs describe it as "marginal-lift imputation"):
  - The prior is the multivariate hypergeometric probability of the leave from unseen tiles. The likelihood is a softmax over the equities of the opponent's reconstructed racks, with a temperature τ.
  - Only a few hundred leaves are measured. Unmeasured leaves are imputed from single, pair and triple "containment lifts", combined by Möbius inversion on the multiset (divisor) lattice.
  - Regularisation: shrinkage c/(c+10), a log-lift clamp of ±log 1e6 and an interaction clamp of ±log 10. The calibration constant is set by moment matching with 5-fold cross-fitting.
  - — [Macondo docs/leave_imputation.md](https://github.com/domino14/macondo/blob/master/docs/leave_imputation.md)
- The inference engine runs for up to 20 s before each move to estimate the opponent's likely leave and bias simulation. — [Cesar's blog: Bayesian rack inference in Macondo (2026)](https://cesars-blog.pages.dev/posts/2026-04-26-bayesian-inference-scrabble/) (via search summary). Woogles describes the inference as "not totally mathematically sound", with no measured edge. — [Woogles BestBot post](https://blog.woogles.io/posts/2025-05-04-the-mathematics-and-algorithms-behind-bestbot)
- **ISMCTS:** Cowling, Powley & Whitehouse (2012) introduced Information Set MCTS to overcome weaknesses of determinization. In such games players may infer opponents' hidden information from their actions, and may bluff. — [Cowling, Powley, Whitehouse 2012 (PDF)](https://eprints.whiterose.ac.uk/75048/1/CowlingPowleyWhitehouse2012.pdf)
- **Heuri (González Romero et al.):**
  - It uses probability-based heuristic evaluation, including the probability of a bingo next turn, with no simulation. The ICGA editorial calls it "quite good at fishing".
  - It beat 2006/2008 world champion Enric Hernández 6–0 and won 53.35% against Quackle's 20-second bot.
  - Earlier work: MICAI 2009, "A Scrabble Heuristic Based on Probability That Performs at Championship Level"; PhD thesis at UPC.
  - — [ICGA Journal editorial](https://content.iospress.com/articles/icga-journal/icg220200); [ICGA article](https://content.iospress.com/articles/icga-journal/icg220201); [dblp](https://dblp.org/rec/journals/icga/RomeroMRAO21) (via search summaries; full texts returned 403)
- **Deep learning:** Agarwal (arXiv:1901.08728) found evolutionary and Bayesian optimisation of feature weights worked poorly. He instead trained a neural network to imitate Quackle simulation move rankings from raw board input. — [arXiv 1901.08728](https://www.arxiv.org/abs/1901.08728) (via search summary)
- A 2019 Stanford CS238 report used Q-learning with a linear value function. — [Stanford AA228 report](https://web.stanford.edu/class/aa228/reports/2019/final41.pdf)
- Woogles states that ML may replace the static evaluator, with early win% prediction "somewhat promising". — [Woogles BestBot post](https://blog.woogles.io/posts/2025-05-04-the-mathematics-and-algorithms-behind-bestbot)
- Variance analysis of Scrabble luck uses Quackle's "utility" (score + precomputed leave value). — [arXiv 1107.2456](https://arxiv.org/pdf/1107.2456)

### Inferences
- In the auction game, opponents' racks are private, but purchases are public; per the README, winning bids are published after matches. That is a far stronger signal than Scrabble plays. The posterior over an opponent's rack can be nearly exact from the auction record: start from known buys and treat only starting tiles as hidden. A Richards-Amir-style likelihood over their word plays then narrows it further.
- Opponent-rack knowledge is worth up to about 37 points per game in Scrabble. In an auction its main use is predicting opponents' reservation prices: the opponent's own P_bingo lift for the tile on offer, computed with the same function used for our own valuation. This feeds bid shading (Vickrey payments mean the second price matters).
- Heuri shows a pure probability heuristic (P(bingo next) x bingo value, plus score) can rival simulation engines. That is attractive under a sub-100 ms budget.

### Gaps
- Heuri's exact formula was not retrieved (Springer redirect to login; thesis 403).
- I found no peer-reviewed AlphaZero/MuZero-style Scrabble paper.

## 5. Expert human rack management: synergy, balance, fishing, and when fishing beats scoring

### Takeaway
Experts keep balanced (about 3 vowels / 4 consonants), duplicate-free leaves rich in S, R, T, N, E and the blank. They play off high-value and clunky tiles and "fish" by playing off one or two tiles only when the remaining stem nearly guarantees a bingo. Engines quantify this as score + leave, and fishing wins when the difference in leave value exceeds the score given up. The auction game has no turn cost for not playing, so "fishing" becomes "holding / not cashing". Its costs are locked currency and end-of-game risk, not a lost turn.

### Cited Findings
- Fishing is "dumping one or two tiles in hopes of playing a bingo or other high-scoring play next turn". Advice: fish only if the rack "virtually assures you of a bonus word next turn" (example: SATIRE + Y). Keep low-scoring tiles and play off high and medium ones, since low-point tiles appear more in bonus words. — [Australian Scrabble Players Assoc.: Rack management](https://scrabble.org.au/strategy/rackman.htm) (via search summary)
- A common heuristic for a good leave: about 3 vowels to 4 consonants, no duplicates, and at least one of S, R, T, N or E. Exchanging costs roughly an average turn. — search summaries of [wordways strategy](https://wordways.com/guides/scrabble-strategy) and [Wikibooks: Bad rack](https://kwx.liehendr.com/content/wikibooks_en_all_maxi_2021-03/A/Scrabble/Dealing_With_a_Bad_Rack) (secondary or coaching sources, lower reliability)
- In engine terms, fishing is just maximising score + leave. With Quackle values, keeping AEINST (+35.3) instead of scoring 15 points with a play leaving, say, AEI (about -10 by the vowel-heavy means above) is worth playing for about 30 fewer points. — computed from [quackle superleaves](https://github.com/quackle/quackle/blob/master/data/strategy/default_english/superleaves) (own decoding)
- Heuri, which explicitly maximises bingo probability next turn, is described as particularly good at fishing. — [ICGA editorial](https://content.iospress.com/articles/icga-journal/icg220200)

### Inferences
- **Hold or cash.** In this game a word can be cashed at any time and there is no bingo bonus beyond the x3 multiplier. Holding a 6-tile stem therefore costs no turn. Its costs are:
  - Liquidity: rewards are currency for auctions.
  - Exposure: the game may end before completion, and unused tiles are worth 0.
  - Opportunity: the tiles could fund shorter words now.
- Rule: hold when P(complete within the remaining k auctions) x (E[7+ reward] - current best cash-out value) exceeds the value of the currency now (marginal value of a coin in upcoming auctions) times the cash given up. For example, AEINST with face sum 6 cashes as SATINE for floor(6 x 2.5) = 15. A 7-letter completion with an average completer pays about 3 x 7-8, roughly 21-24, plus more if the added letter is high value. With about 96% one-tile completion odds, holding is clearly right if any further tile can be bought cheaply.
- **Multiplier arithmetic** makes length dominant: x1, x1.5, x2, x2.5, x3. Splitting 7 tiles into 4 + 3 pays 1.5 x s1 + 1 x s2, versus 3 x (s1 + s2) for a single 7-letter word, roughly half. The marginal tile that turns a 6-letter word into 7 raises the payout from 2.5 to 3 times the face sum, plus that tile's own value x3.

### Gaps
- No primary quantitative study of human fishing break-even points was found. The expert rules above come from coaching sites via search summaries.

## 6. Computing P(complete a 7-letter word within k more draws) fast (DAWG/GADDAG, anagram maps, leave tables, Monte Carlo) under about 100 ms

### Takeaway
Without a board, a GADDAG is unnecessary. Use an anagram map keyed by sorted letters (alphagrams) for 7- and 8-letter words, plus a precomputed map from 6-tile stem to its set of completing letters. That map was built here from all 19,131 bag-feasible 7-letter alphagrams in well under a second of Python. Completion within k draws is then a hypergeometric calculation over the missing tiles of each reachable alphagram. Monte Carlo sampling of future draws or purchases is cheap: one rack check is at most C(n,7) hash lookups. Engine-style exhaustive leave tables (all 1-6 tile sub-racks, about 5.4M entries for 27 kinds) fit in memory for an O(1) value lookup.

### Cited Findings
- Wolges' sub-rack catalogue enumerates all holdings from 0 to 7 tiles for 27 tile kinds: 5,379,616 sub-racks. Each is indexed by a direct formula (ordered by size, then letter counts) with no stored table. The census computes the best value of every full rack "for every full rack in the catalog at once" and checks the result against a brute-force reference. — [wolges lab/leavegen.txt](https://github.com/andy-k/wolges/blob/main/lab/leavegen.txt)
- The KLV2 format stores a 32-bit float per leave and is compiled from a CSV of leave values by `buildlex` (MIT-licensed code). The wolges README shows `buildlex -- kwg --words alphagrams ... .kad` to build an alphagram word graph. — [wolges README](https://github.com/andy-k/wolges/blob/main/README.md); [wolges LICENSE.txt](https://github.com/andy-k/wolges/blob/main/LICENSE.txt)
- Quackle's superleave table for English has 914,624 entries (1–6 tiles, including the blank) and is loaded into a map keyed by the sorted leave string. — own decoding of [quackle superleaves](https://github.com/quackle/quackle/blob/master/data/strategy/default_english/superleaves) with the [loader](https://github.com/quackle/quackle/blob/master/strategyparameters.cpp)
- Macondo's imputation shows how to extend values from measured to unmeasured multisets with low-order (single, pair, triple) interaction terms via Möbius inversion on the multiset lattice, handling repeated letters correctly. — [Macondo leave_imputation.md](https://github.com/domino14/macondo/blob/master/docs/leave_imputation.md)
- Own computation (Python, single thread, unoptimised): 200,000 seven-tile racks plus 26 candidate letters each ran comfortably within a background job of a few minutes. That works out to roughly single-digit microseconds per hash lookup. 40,000 samples of 8-tile racks with 8 sub-rack lookups each, for 26 letters, also completed quickly.

### Inferences
Recommended data structures and algorithm for the bot (TypeScript):
1. **Offline:** build `A7: Map<alphagram, maxReward>` and `A8` the same way, using floor(sum x 3) (best spelling per alphagram). Build `stem6: Map<alphagram6, letterMask>` and `stem7to8` similarly. Optionally build `stem5: Map<alphagram5, pairs needed>` for two-away completion.
2. **Distance-d completion:** for rack R, enumerate target alphagrams T reachable by adding d ≤ 2 tiles. Use 6-sub-multisets of R (C(n,6) of them) with `stem6` for d = 1, and 5-sub-multisets with `stem5` for d = 2. Each gives a missing multiset M.
3. **P(acquire M within k opportunities):** use a hypergeometric over the unseen pool, i.e. bag minus own rack minus publicly bought tiles. Multiply by our expected auction win probability per tile, or by the expected affordability at the predicted clearing price. Combine targets by inclusion-exclusion over the union of completing letters (the letter-mask OR), rather than summing.
4. **Value of candidate letter x:**
   - V(x | R) = [best cash-out(R+x) - best cash-out(R)] + Σ_targets ΔP_complete x E[reward(T)] - risk and liquidity discount.
   - Cache by alphagram of R. Racks with 12+ tiles give C(12,6) = 924 lookups per letter, well under 1 ms.
5. **Monte Carlo fallback:** sample 200–1,000 future acquisition sequences of length k from the unseen pool weighted by win probability, and evaluate the best cash-out with the planner. At about 10 µs per evaluation this fits in 10 ms.
6. **Boardless superleave table:** run the Wolges census idea with the play-value sheet = best ENABLE word reward for each tile multiset (board-independent, so exact). Self-play the auction simulator for the "draw" distribution and blend census with self-play 50/50, as Wolges found best. Store it keyed by a sorted string or a mixed-radix index.

### Gaps
- No published benchmark of anagram-map vs DAWG lookup speed in JavaScript was found; timings above are rough Python observations, not measured benchmarks.

## 7. Adjacent letter-buying or letter-drafting games (Letter Tycoon, Paperback, Bananagrams, Wordle entropy)

### Takeaway
Adjacent commercial games offer only anecdotal valuation advice: value letters by spellability, not face value, and avoid consonant-only hands. I found no formal letter-valuation analyses for Letter Tycoon or Paperback. The transferable formal tools are Scrabble leave tables and the information-theoretic expected-value framing.

### Cited Findings
- Letter Tycoon: players form the longest word possible each turn for money and stock. They may buy a "patent" on a letter used in the word, at the price printed on the card, and patents pay out when others use that letter. A reviewer notes that a great Q word tends to win. — [Letter Tycoon rulebook (Tabletopia)](https://c.tabletopia.com/games/letter-tycoon-1/rules/rules-book/en); [What's Eric Playing: Letter Tycoon](https://whatsericplaying.com/2016/08/07/letter-tycoon/) (via search summary)
- Paperback, a deckbuilder: players buy stronger letters with the score their word earned. Cards are "only worth anything if you can spell out a word with them", and all-consonant hands are a real problem. — [Frontline Gaming review](https://frontlinegaming.org/2023/10/17/board-game-review-paper-back/); [What's Eric Playing: Paperback](https://whatsericplaying.com/2016/01/10/26-paperback/) (via search summary)

### Inferences
- The Letter Tycoon patent mechanic is analogous to auction pricing: a letter's price should reflect its usage frequency across the remaining game. In our game that frequency is captured by per-letter bingo lift (S ≫ R ≈ N ≈ T ≈ L > ... > Z, X, J, Q) times the expected reward.
- Wordle-solver entropy (choosing guesses that maximise expected information) parallels choosing letters that maximise the number of reachable 7-letter alphagrams, i.e. the "completers" count or option value. A tile that keeps many stems open is worth more than one that commits to a single word, even at equal immediate P.

### Gaps
- I did not retrieve a formal or quantitative analysis of letter valuation in Letter Tycoon, Paperback or Bananagrams. Wordle entropy methods were not researched in this pass, as they are tangential to the auction setting.
