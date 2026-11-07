# Real-World Budgeted Auctions and Drafts: Strategy Lessons and Measured Data for a Letter-Tile Auction Game

Game being mapped to: 6 players, 100 starting currency, about 68 sequential second-price auctions of letter tiles, tiles combine into words, income from playing words, leftover money worthless at end. Our bot overpays early and runs out of money; rivals buy about twice as many tiles, cheaply and evenly across the game.

Labels used below: **[FIELD]** = measured real-world data; **[LAB]** = controlled experiment; **[SIM]** = simulation or theory; **[OPINION]** = practitioner advice with no dataset. "Analogy strength" rates how well each source transfers to the tile game.

## Q1. Fantasy sports salary-cap auction drafts: early vs late prices, stars-and-scrubs vs balanced, inflation, nomination, end-game bargains

### Takeaway
The one peer-reviewed field study (Boudreau & Shunda 2016, fantasy basketball) finds exactly our bot's failure: individual bidders overpay for their **first 2-3 wins**, then underpay for the next few. Prices follow recommended values on average, but each bidder's own path is front-loaded. Practitioner data (15 human mock drafts) shows that players nominated earlier than their rank sell above value 64-84% of the time, and players nominated later than their rank are bargains 52-84% of the time. I found no rigorous dataset comparing stars-and-scrubs with a balanced budget.

### Cited Findings
- **[FIELD] Boudreau & Shunda (2016)**, *J. Behavioral & Experimental Economics* 62:8-22, a natural field experiment on fantasy basketball auction drafts. Every bidder had the same budget, and the platform showed non-binding recommended prices.
  - Recommended prices were "reasonable predictions of player value" and average bidding followed them.
  - Individually, bidders overpaid relative to the recommended value for their first two or three wins, regardless of which players those were. They underpaid for the next few picks, then overpaid somewhat on their last pick.
  - The authors call this a new variety of the declining-price phenomenon caused by the budget structure.
  - Sources: [IDEAS/RePEc abstract](https://ideas.repec.org/a/eee/soceco/v62y2016icp8-22.html); [EconPapers](https://econpapers.repec.org/RePEc:eee:soceco:v:62:y:2016:i:c:p:8-22).
  - The sample size and the dollar size of the overbid were not available (paywalled).
- **[FIELD, practitioner-collected] Nomination timing vs price (Fantasy Footballers, July 2022).** Data from 15 mock drafts with live humans only (collected by Adam Segal). "Deal" or "over-priced" means the salary rank is at least 2 spots off the player's average-auction-value rank within his position. [Source](https://www.thefantasyfootballers.com/auction/fantasy-football-the-impact-of-nomination-order-in-auction-salary-cap-drafts)

  | Nomination vs value rank | Players | Deal | At price | Over-priced |
  |---|---|---|---|---|
  | Nominated ahead of rank (all) | 1,142 | 13% | 23% | 64% |
  | At rank | 262 | 19% | 62% | 19% |
  | Nominated after rank (all) | 1,338 | 52% | 32% | 16% |
  | 10 or more spots early | 207 | 12% | 4% | 84% |
  | 6-10 spots late | 213 | 69% | 18% | 12% |
  | 10 or more spots late | 99 | 84% | 10% | 6% |

  The article's tactic is to log nominations, not chase a player nominated well ahead of rank, and wait for similarly ranked players who are likely to come up later.
- **[OPINION]** NBC Sports argues that very early nominations tend to be slightly *under*valued because "the inflation rate" of the room is not yet known. [NBC Sports](https://www.nbcsports.com/fantasy/football/news/article-adp-analysis-flex-leagues-auction-recap). This conflicts with the Boudreau & Shunda field data (early overpayment) and with the Fantasy Footballers data above.
- **[OPINION] Inflation calculator (Rotoman):** inflation rate = remaining money ÷ remaining talent value. The post argues inflation is not uniform and should be spread by dollar amount rather than by percentage. It also notes teams often finish with **unspent budget** because they misjudge inflation mid-auction. [Rotoman's Guide](https://rotoman.substack.com/p/reader-mail)
- **[OPINION]** Consistent nomination advice is to nominate players you don't want early, to drain rivals' budgets, and to keep a few dollars for late bargains. [RotoStreetJournal](https://www.rotostreetjournal.com/2020/08/20/how-to-dominate-a-fantasy-football-auction-draft-part-4-in-draft-strategy-tips/); [FanGraphs nomination guide](https://fantasy.fangraphs.com/nomination-strategy-guide/)
- **[OPINION, recap]** In the 2026 LABR NL auction, an early run on pitchers left few late pitching bargains. Late bargains appear in the categories rivals have already finished buying, not across the board. [USA Today/AOL recap](https://www.aol.com/articles/fantasy-baseball-draft-tips-nl-183054722.html)
- **[THEORY]** Related work:
  - Anagnostopoulos, Sviridenko & Leonardi (WINE 2016), "Bidding Strategies for Fantasy-Sports Auctions", designs simple strategies with worst-case guarantees. [AMiner](https://aminer.org/pub/58d8301ad649053542fe2dd3/bidding-strategies-for-fantasy-sports-auctions)
  - Maniezzo & Aspee Encina (2022) apply forecasting plus subgradient optimization for real-time bid support under scarce budgets. [Unibo](https://cris.unibo.it/handle/11585/893586)

### Inferences
- **Transfer: strong.** Fantasy auctions are the closest real analogy: same budget for all, many sequential items, a fixed roster to fill, and leftover money worthless. The Boudreau & Shunda pattern (overpay for the first 2-3 wins, then starve) is a documented human bias that our bot reproduces.
  - Fix: cap each early bid by a pacing rule, such as spend ≤ remaining money × (tiles still needed ÷ tiles remaining in auction) × a value multiplier.
  - Do not let "I have no tiles yet" raise willingness to pay.
- **Transfer: moderate.** In the nomination data, bargains come from items that arrive *after* rivals have filled that need. In the tile game the analogue is a letter arriving after rivals' racks or word plans no longer need it, for example a third E when everyone holds vowels. The bot should value tiles conditional on **rivals' current holdings**, not only its own needs.
- **Transfer: moderate to weak.** The nomination tactic does not transfer if the tile order is fixed by the game rather than chosen by players. In that case the useful lesson is only "items that come up when budgets are drained sell cheap."
- **Inflation calculator transfer: strong.** Track (total cash held by all players + expected future income) ÷ (expected remaining tile value) as a live "room price index." Scale bids to it instead of to static tile values.
- Stars-and-scrubs vs balanced: no data found.
  - Inference only: in our game, rivals' "many cheap tiles, evenly spread" approach is the balanced strategy and appears to win.
  - Since words need several complementary letters, a rack of many cheap tiles gives more word options (more ways to combine) than a few "star" tiles (for example Q, Z, X). This favors balanced spending.

### Gaps
- Boudreau & Shunda sample size, the size of the early overbid, and the full text were behind a paywall.
- No academic dataset compares stars-and-scrubs with a balanced roster on final standings.
- No large dataset (for example ESPN or Yahoo league exports) regressing price/value on nomination slot was found.
- The NBC claim that early nominations are undervalued is unsupported by any data I found.

## Q2. Sports player auctions with budget caps (IPL, Pro Kabaddi): price dynamics, order effects, budget exhaustion, winner's curse

### Takeaway
I found **no peer-reviewed study that measures order effects or within-auction price paths in IPL or PKL auctions**. The academic work found is hedonic (which player attributes predict price). Evidence on overpayment is weak (a consultancy study) or comes from adjacent markets (MLB free agents overpaid about 50%). Budget exhaustion is routine: PKL teams spend essentially the whole purse.

### Cited Findings
- **[FIELD, hedonic]** Karnik, "Pricing of Cricketers: The Experience of Two IPL Auctions", *Int. J. Sport Finance* 8 (2013). Price determinants for 2011 were short-format runs, Test wickets, age and nationality. The valuation process was unchanged between 2008 and 2011. It does not test sale order. [IDEAS](https://ideas.repec.org/a/jsf/intjsf/v8y2013i1p3-20.html)
- **[FIELD]** A *Journal of Sports Analytics* paper compares IPL auction price against later performance. It notes large mismatches (e.g., Yuvraj Singh sold for ₹16 crore in 2015 despite weak performance) and describes the format as open ascending bids with players called in skill-based sets. Full text was blocked (HTTP 403). [Search summary](https://www.valueresearchonline.com/stories/30898/ipl-and-behavioural-economics); [article page](https://content.iospress.com/articles/journal-of-sports-analytics/jsa200580)
- **[FIELD, consultancy, not peer-reviewed]** A 2008 Vertebrand analysis of 90 contracted IPL players found franchises incurred "losses" (auction price above estimated ideal value) on almost 50% of them. [Business Today](https://www.businesstoday.in/magazine/in-this-issue/story/the-game-changers-128231-2008-09-30)
- **[FIELD, adjacent market]** A 1996 Caltech working paper found MLB free agents overpaid by about 50% on average relative to their revenue impact. [Caltech](https://authors.library.caltech.edu/records/g0knw-0jx59)
- **[OPINION, informed journalism]** Scroll.in on the 2022 IPL mega-auction:
  - Auction order is "one of the single most important factors" in price.
  - Players in early sets go cheaper because teams wait while first-choice alternatives remain.
  - The last available player in a role or tier commands a premium once backups are gone.
  - Half the teams had spent over 40% of their purse on retentions.
  - Teams' target prices move by "all to nothing" (if target A is bought, substitute B is worth zero) or "anchor and adjust."
  - Dual-role players earn premiums.
  - [Scroll.in](https://scroll.in/field/1017144/the-mad-world-of-ipl-auction-dynamics-and-how-it-can-affect-player-pricing)
- **[FIELD, news]** PKL purse figures:
  - ₹5 crore purse per team in Season 11 (2024), with retentions drawn from the same purse. [Pro Kabaddi official](https://www.prokabaddi.com/news/pkl-11-player-auction-purse-value-budget-team-balance-retained-squads); [Sportskeeda](https://sportskeeda.com/kabaddi/news-pro-kabaddi-2024-what-total-purse-available-team-retentions-nyps-pkl-11)
  - Haryana Steelers spent ₹4.99 crore of ₹5 crore in Season 11. [Sportskeeda](https://www.sportskeeda.com/kabaddi/pro-kabaddi-2024-auction-purse-remaining-12-teams-pkl-11-auction-retentions-nyp-signings)
  - 2018: ₹46.99 crore spent on 227 players by 12 franchises. [DNA India](https://www.dnaindia.com/sports/report-unprecedented-rs-47-crore-spent-in-pro-kabaddi-league-player-auction-2448620)

### Inferences
- **Transfer: moderate.** Like the tile game, IPL/PKL have a fixed purse, roster minimums and role scarcity, and leftover purse has no value. The "last one in its role" premium maps directly to letters: when the last remaining U or the last vowel arrives and several players need it, expect a price spike. When many substitutes remain (several Es still to come), price stays low.
- The bot should estimate **remaining supply of each letter** (from the known tile distribution minus tiles already sold) and treat scarcity, not base tile value, as the price driver.
- **"All-to-nothing" transfer: strong.** Once the bot has bought tile A for a target word, a substitute tile B that fills the same slot drops to near-zero marginal value. The bot should re-price every tile after each purchase.
- The overpayment evidence (about 50% in MLB; about 50% of IPL players in one consultancy study) suggests a winner's-curse discount. **Transfer is weak to moderate**: those are common-value or uncertain-value settings, while tile value to our bot is mostly computable (private value given the dictionary). The winner's curse matters less here than budget pacing.

### Gaps
- No peer-reviewed IPL/PKL paper was found measuring price vs lot order, team budget run-down over the auction, or late-auction bargains.
- The Journal of Sports Analytics full text could not be retrieved, so its sample size and effect sizes are unknown.
- No academic PKL auction study was found.

## Q3. Sequential art, wine, fish, flower, fur and cattle auctions: within-sale price paths and buyers with fixed needs

### Takeaway
The **declining price anomaly** (later identical lots sell for less) is found almost everywhere sequential auctions have been measured: wine, art, flowers, fish, lobster, fur, livestock, wool, stamps and others. Where measured precisely (Dutch roses), each successive identical unit sells about 2-2.5% below the previous one. Theory and simulations show that with budget-limited or fixed-need buyers, early prices carry a premium for certainty, and buyers who can wait get cheaper units later.

### Cited Findings
- **[FIELD] Dutch rose auctions, Aalsmeer** (van den Berg, van Ours & Pradhan, AER 2001; Tinbergen WP 99-074). [Tinbergen PDF](https://papers.tinbergen.nl/99074.pdf); [Tilburg record](https://research.tilburguniversity.edu/en/publications/declining-prices-in-the-sequential-dutch-flower-auction-of-roses/)
  - Fixed-effects estimates of the log price change at successive transactions of the same lot (Table 3):

    | Step | Log price change | t-value |
    |---|---|---|
    | 1→2 | −0.0223 | −14.6 |
    | 2→3 | −0.0200 | |
    | 3→4 | −0.0217 | |
    | 4→5 | −0.0170 | |
    | 5→6 | −0.0085 | not significant |

    That is about **−2% per successive unit**.
  - Sign of price change over 7,058 consecutive-transaction pairs (Table 2): 39% declines, 24% constant, 37% increases. For 1→2 alone: 34% decline, 20% constant, 46% increase. The *average* falls, but individual steps are noisy.
  - Two-unit lots sold in two rounds fell 3.57% from the 1st to the 2nd unit (n = 405 lots). Three-unit lots sold 1+2 fell 4.38% (n = 267) (Table 4).
  - The decline is steeper when few units remain: −3.6% with 2 units left vs −1.1% with 10 left (Table 5).
  - Mechanism: a buyer's option (the first winner may take more units at the same price).
  - 14,092 transactions in the buyer-size table.
- **[SIM + survey of field evidence]** Narayan, Prebet & Vetta (2019), [arXiv 1905.00853](https://arxiv.org/pdf/1905.00853):
  - The anomaly has been documented in wine (Ashenfelter 1989), livestock (Buccola), Picasso prints, satellite transponder leases, antiques, commercial real estate, condominiums, fish (Gallegati et al.), flowers, fur (Lambson & Thurston), lobsters (Salladarré et al.), jewellery, paintings (Beggs & Graddy), stamps and wool.
  - The standard theory benchmark (Milgrom-Weber) says prices should be a martingale (flat on average), and if values are affiliated, prices can drift *upward*.
  - With exactly two multi-unit-demand buyers, equilibrium prices are weakly declining (Gale & Stegeman). With 3+ buyers a price rise is possible but extremely rare: 0.000183 of over 6 million simulated auctions.
- **[FIELD] Art:** Beggs & Graddy (RAND J. Econ 1997): the final bid relative to the auctioneer's estimate declines over the course of a sale (the "afternoon effect"). Magnitude not retrieved. [IDEAS](https://ideas.repec.org/a/rje/randje/v28y1997iautumnp544-565.html); [LBS](https://www.london.edu/faculty-and-research/academic-research/d/declining-values-and-the-afternoon-effect-evidence-from-art-auctions)
- **[FIELD] Lobster (Nephrops) auctions, France** (Salladarré et al.):
  - The decline is steeper in shortage periods.
  - Wholesalers and fishmongers (small, fixed-need buyers) start seeing declines earlier than supermarket buyers.
  - From the abstract via search. Full text was blocked by bot protection. [HAL/INRAE](https://hal.inrae.fr/hal-02796465v1/file/publis16-mistea-028_salladarr%C3%A9_declining_1.pdf)
- **[FIELD + model] Ancona fish market** (Gallegati, Giulioni, Kirman & Palestrini, JEBO 2011): the declining price is explained by a bid-setting rule tied to the variation in recent transaction prices during the day. [EconPapers](https://econpapers.repec.org/RePEc:eee:jeborg:v:80:y:2011:i:1:p:20-33)
- **[SIM] Fish markets** (Guerci, Kirman & Moulet, JEDC 2014): agent-based model of sequential Dutch fish auctions. Buyers who **learn the option value of bidding in later rounds** produce declining prices without diminishing marginal profit. [EconPapers](https://econpapers.repec.org/RePEc:eee:dyncon:v:48:y:2014:i:c:p:374-393)
- **[FIELD] Fur:** Lambson & Thurston, "Sequential Auctions: Theory and Evidence from the Seattle Fur Exchange", RAND J. Econ 37(1), 2006. Cited as declining-price evidence. Numbers not retrieved. [IDEAS](https://ideas.repec.org/a/bla/randje/v37y20061p70-80.html)

### Inferences
- **Transfer: moderate, with an important caveat.** These are sales of *identical* units with fixed buyer budgets. In the tile game, letters differ and players earn **income during the game**, which pushes later prices *up*. The Milgrom-Weber note that affiliated values can make prices drift upward also points to possible upward drift.
  - So the bot should **measure its own game's price path** (average clearing price by round, and by letter) rather than assume a decline.
  - Rivals' observed behavior ("cheap and even") suggests clearing prices are not rising steeply in practice.
- **The option-value lesson transfers strongly regardless of direction.** A buyer who knows more units of a similar good will come (more Es, more Ts) should bid below its immediate value by the expected discount from waiting. Our bot apparently bids full immediate value. Fixed-need buyers (fishmongers) who stay calm buy cheaper later.
- Steeper decline when few units remain (roses) and in shortage periods (lobster) means scarcity dynamics dominate near the end. Expect bargains in the final rounds on letters nobody can still use, and spikes on letters several players need.
- Two-buyer theory says prices decline weakly. With 6 players, price rises are theoretically possible but rare. The safest default is "do not front-load; units keep coming."

### Gaps
- The McAfee & Vincent figure (second unit of wine 1.4% cheaper than the first) appeared only as a secondary citation in search results. It is unverified, and no primary URL was confirmed.
- Magnitudes for the art (Beggs & Graddy), fur (Lambson & Thurston) and cattle/livestock (Buccola) declines were not retrieved.
- No Tokyo tuna (Tsukiji/Toyosu) within-day price study was found.
- No study was found of sequential auctions where buyers earn income mid-auction, the feature most specific to this game.

## Q4. Magic: The Gathering and card-game drafts: pick order vs synergy, staying open vs committing, signals, draft bots

### Takeaway
In a large human-draft dataset (107,949 drafts), humans pick on raw power at the start of each pack and on synergy with their pool mid-pack. The best predictive bot (a neural network) matches only 48.7% of human picks. The well-tuned heuristic bot uses an explicit **"speculation then commitment"** rule: strength plus a color bonus that grows with commitment and is capped, committing once a threshold is passed. 17Lands data shows that reading signals pays: color strength seen in pack 1 predicts pack 3. I found no public study directly measuring the win rate of staying open vs committing early.

### Cited Findings
- **[FIELD dataset + bots] Ward, Brooks, Troha, Mills & Khakhalin**, "AI solutions for drafting in Magic: the Gathering" (IEEE CoG 2021; [arXiv 2009.00655](https://export.arxiv.org/pdf/2009.00655)):
  - Data: 107,949 Draftsim M19 drafts, split into 86,359 train and 21,590 test.
  - Top-1 accuracy predicting the human pick:

    | Bot | Accuracy |
    |---|---|
    | RandomBot | 22.15% |
    | RaredraftBot | 30.53% |
    | DraftsimBot (expert heuristic) | 44.54% |
    | BayesBot | 43.35% |
    | NNetBot | 48.67% |

    All differences are significant (Tukey p < 2e-16).
  - All non-random bots are more accurate at the **start of each pack than mid-pack**. The authors read this as humans picking on strength or rarity early in a pack and on synergy with their collection mid-pack.
  - DraftsimBot mechanics: rating = strength (expert 0-5 scale) + color bias.
    - Commitment to a color = sum over owned cards of that color, with cards below strength 2.0 ignored (the weakest 20% of the set, 53 cards).
    - On-color bonus ≈ 0.257 × commitment, capped at 0.9. Multicolor cards get a −0.6 adjustment.
    - Committed to a color once commitment exceeds 3.5. After committing to 2+ colors, on-color cards get a large bonus ("strict in-color drafting").
    - (My PDF text extraction was garbled around the exact end of the speculation phase.)
  - Limitation stated by the authors: the bots mimic humans and were not evaluated on deck win rate.
- **[FIELD] 17Lands "Do the bots send signals?"** (Robert Conroy). [17Lands blog](https://blog.17lands.com/posts/bot-signals/)
  - Data: War of the Spark Arena drafts (May 9 – June 20) plus hundreds of human Magic Online drafts.
  - A **positive slope** between a color's pack-1 openness and its pack-3 strength in both samples, steeper on Arena, so signals are real and readable.
  - Colors that bots overvalue relative to humans underperform. White: 35.1% metagame share, 41.9% win rate (n = 1,063 games). Blue: 49.1% share, 44.4% win rate (n = 1,490).
  - Arena bots never passed 18 rares/mythics vs 4 in the human sample: bots follow rigid pick orders and do not self-correct.
- **[FIELD] 17Lands wheel rates, Dominaria United** (MTGAZone):
  - 2-pip signpost uncommons wheel (come back around) only 2-11% of the time in pack 1, rising to 7-25% in pack 3.
  - Dual lands wheel 40-50% in pack 1, falling to 23-35% in pack 3.
  - Good commons go around pick 4-6 (ALSA).
  - [MTGAZone](https://mtgazone.com/data-based-heuristics-for-mtg-arena-drafts/)
- **[OPINION]** Star City Games asks when staying open in Dominaria United "turns into a trap", without win-rate data. [SCG](https://articles.starcitygames.com/magic-the-gathering/when-to-pick-lanes-early-in-dominaria-united-limited/)
- **[OPINION]** Sam Black suggests first-picking the card with the highest win rate when played, which already folds in the decks it ends up in. [SCG on 17Lands](https://articles.starcitygames.com/magic-the-gathering/select/using-17lands-com-as-a-resource-to-improve-at-limited/)

### Inferences
- **Transfer: moderate to strong for the commitment rule; weak for the money side.** MTG drafting has no currency, so it says nothing about price. It does model "build complementary sets from a shared, sequentially revealed pool where rivals compete for the same pieces," which is the word-building half of our game.
- **Concrete rule to borrow (DraftsimBot-style):**
  - Value of a tile = base flexibility value (how many likely words it fits) + target-word bonus.
  - The bonus grows with how far along the bot is on a target word and is **capped** (as the 0.9 cap prevents over-commitment).
  - Commit to a target word only once a threshold of its letters is already owned (analogous to commitment > 3.5). Before that, buy generically useful tiles (common vowels and consonants) cheaply.
  - This directly counters early overpayment for a speculative word.
- Strength early in a pack, synergy mid-pack: early in the game, buy flexible, broadly useful tiles. Later, pay a synergy premium only for tiles that complete a near-finished word.
- **Signals transfer (moderate):** if rivals are not bidding on certain letters (low clearing prices), those letters, and words built from them, are "open." The bot should steer target words toward under-contested letters, as drafters move into open colors.
- **Wheel-rate lesson:** strong, narrow-use pieces (signpost uncommons) rarely come back. Generic pieces (dual lands) often do. For tiles: a rare letter that several rivals need will not "wheel," while common letters will recur. Do not overpay for common letters, because substitutes will come.

### Gaps
- No public 17Lands analysis was found that directly compares the win rate of early commitment vs staying open, or the maindeck rate of first picks.
- 17Lands users are self-selected stronger players. A community claim that they win more than the general population was seen but not from a citable source.
- Ward et al. evaluate imitation of humans, not winning, so their bots' rules are not proven optimal.

## Q5. Spectrum auctions, FCC and combinatorial auctions: budget management and exposure in the field

### Takeaway
Bulow, Levin & Milgrom (advisers to SpectrumCo in FCC Auction 66, 2006) show that in budget-constrained multi-item auctions, **final prices can be forecast early from total bidder exposure (aggregate budgets)**. Their bidder used that forecast to switch from contested large licenses to underpriced smaller substitutes. It paid about a third less than incumbents for equivalent coverage (under $2.4B vs over $3.5B at incumbent prices). They also state that **bidding your value is a poor strategy for a budget-constrained bidder even in a Vickrey (second-price) auction**.

### Cited Findings
All findings below are from Bulow, Levin & Milgrom, "Winning Play in Spectrum Auctions", [NBER WP 14765](https://www.nber.org/papers/w14765.pdf) (2009) [FIELD + practitioner].

- **AWS Auction 66 outcome:**
  - $13.9B total, 168 bidders.
  - SpectrumCo bought near-national coverage for under $2.4B. At incumbents' prices it would have cost over $3.5B, a saving of about a third (more than $1B).
  - The authors credit "budget-based price forecasts" for putting it "in a position to be lucky."
- **Budget constraints are "ubiquitous".** Exposure problems (wanting complementary items) and budget problems both arise from uncertainty about final prices.
- **Budget hypothesis:** a bidder with a binding budget and broad, substitutable interests ends up spending its whole budget or nearly so. Total exposure (total value of all standing bids) levels off at aggregate budgets.
- **Forecasting accuracy:**
  - Auction 66: exposure peaked at $14.2B in round 11 vs final revenue of $13.9B.
  - From round 15, forecasting final revenue = current exposure never erred by more than 10%, even though prices were still 40% below their final level.
  - Auction 35: by round 10, revenue was under a third of its final level while exposure was near its final level.
  - In 9 of 10 earlier FCC auctions, exposure reached 90% of final revenue while revenue was still under half its final level.
- **Price path lesson:** early bidding concentrated on the large regional (REAG) licenses. By round 15 it was forecastable that their high bids had absorbed so much of total budgets that the smaller (EA/CMA) licenses would sell at a steep discount. SpectrumCo, alone among major bidders, switched early.
- **Exceptions:**
  - All-or-nothing bidders with no substitutes (Wireless DBS; the Dolans bidding for New York) simply exited when prices got too high.
  - FCC Auction 73: exposure peaked at $25.6B vs final $19.6B, mostly because Google ($4.7B standing bid) exited.
- **Pre-auction forecasts are noisy:** analysts estimated AWS revenue at $7-15B, and 700 MHz at $10-30B.
- **Vickrey with budgets:** example with values A = $200M, B = $100M and a budget of $150M. Bidding true values in a Vickrey auction is poor strategy when the budget binds.
- **Handbook chapter:** distinguishes hard budgets from soft budgets that can be revised. Direct evidence of budget effects in real combinatorial clock auctions is hard to get. [Cambridge Handbook of Spectrum Auction Design](https://cambridge.org/core/books/handbook-of-spectrum-auction-design/budget-constraints-in-combinatorial-clock-auctions/F2F0A25B0DA54C78E720F8AF6B9186E0)

### Inferences
- **Transfer: strong for the budget-forecasting idea; moderate overall.** Spectrum auctions are simultaneous ascending auctions, not sequential sealed bids, but the core logic carries over.
  - With 6 budget-limited players, total money in the game (cash + expected income) bounds total spending on the remaining tiles.
  - Forecast average clearing price ≈ (sum of rivals' cash + expected rival income) ÷ (tiles remaining they will want).
  - If that number is low, waiting is cheap. If rivals are cash-rich and few tiles remain, buy now.
- **SpectrumCo lesson = rivals' behavior.** When everyone chases the "big" items (premium letters, high-value tiles), budgets are absorbed there and the plain substitutes (common letters) go cheap. Rivals buying many cheap tiles evenly are doing what SpectrumCo did. Our bot is doing what the incumbents did.
- **Exposure-problem transfer: strong.** Buying the first letters of a long target word exposes the bot: if the remaining letters become expensive or never arrive, the sunk tiles are worth little. Prefer target words whose remaining letters are common (high remaining supply).
- **The Vickrey-with-budget point applies directly.** In this game "bid your value" is not dominant, because money spent now is unavailable later. Bid = value − opportunity cost of cash (the shadow price of the budget).

### Gaps
- FCC Incentive Auction (Auction 1000) bidder budget data and consultant lessons were not retrieved.
- The SpectrumCo case is reported by its own advisers, so it may be self-serving. The authors themselves note that luck contributed.

## Q6. eBay sniping and last-moment bidding (Roth & Ockenfels): timing data and transfer to sealed bids

### Takeaway
On hard-close eBay, about **40% (computers) to 59% (antiques) of auctions had last bids in the final 5 minutes, vs about 3% on Amazon**, whose auctions auto-extend. More experienced eBay bidders bid later. Sniping exists to avoid revealing information and starting bidding wars in an open, observable auction. The **timing lesson barely transfers to one-shot sealed bids**. The **information lesson transfers**: avoid revealing your target word through visible bidding patterns.

### Cited Findings
All from Roth & Ockenfels, AER 92(4) 2002 [FIELD]. [Princeton-hosted PDF](https://www.cs.princeton.edu/courses/archive/spr08/cos444/papers/roth_ockenfels02.pdf)

- **Sample:** 480 auctions with 2,279 bidders, 120 each of eBay Computers, eBay Antiques, Amazon Computers and Amazon Antiques.
- **Auction level:** 40% of eBay Computers and 59% of eBay Antiques auctions had last bids in the last 5 minutes, vs about 3% of each Amazon category. In 240 eBay auctions, 89 had bids in the last minute and 29 in the last 10 seconds. Amazon had 1 bid in the last minute.
- **Bidder level:**
  - Last 5 minutes: 9% (Computers) and 16% (Antiques) of eBay bidders vs about 1% on Amazon.
  - Last hour: 20% of eBay last bids vs 7% on Amazon.
- **Experience:** eBay feedback number (a proxy for experience) is significantly *positively* related to bidding late. On Amazon the relation is weakly negative. Late bidding responds to the rules, not to naivety.
- **Information:** more sniping in antiques (where expertise reveals value) than computers.
- **Survey:** 368 late bidders surveyed, 20% responded.
  - 86% said a late bid had failed to register at least once.
  - About 90% had sometimes been unable to bid late as planned.
  - Median self-estimated failure risk: 10% for each kind of risk.
- **Other:** eBay prices can double in the last 60 seconds.
- 2000-2002 data, and eBay later changed some rules. [Search summary](https://nsdl.library.cornell.edu/websites/expertvoices/info2040/archives/1814.html)

### Inferences
- **Timing transfer: weak.** Each tile auction in our game is presumably a one-shot sealed second-price auction, so there is no "late" within a round to snipe.
- **Analogue transfers (moderate):** across the 68-auction sequence, the bot's *pattern* of bids is public, at least through who won and possibly prices. Bidding aggressively and consistently for, say, the letters of QUIZ tells rivals the target, and they can bid up or block the missing letters.
  - Lesson: keep bids on target-word letters close to generic tile value until the last needed letter appears. Then pay the completion premium on that tile only.
  - This is the sequential-auction version of "don't reveal information early."
- **Experience lesson (moderate):** sophisticated bidders change *when* they commit money in response to the rules. Our rivals' cheap and even buying may be the equilibrium response to a rule set where early overbidding is punished.

### Gaps
- No field study was found on information leakage across sequential sealed-bid auctions with observable winners, the setting closest to our game.

## Q7. Overbidding and the winner's curse in second-price auctions: lab and field

### Takeaway
In the lab, **about 58-67% of second-price bids exceed value** (Kagel & Levin 1993). Only about 27-33% bid at value, the dominant strategy. Overbidding persists because feedback is weak: winners rarely lose money. Highly experienced eBay traders in a field-lab test show **no net overbidding**: 38% overbid and 41% underbid, with sellers tending to underbid. Even without budgets, humans systematically overbid in second-price auctions. Adding a budget makes overbidding even more costly.

### Cited Findings
- **[LAB] Kagel & Levin (1993)**, *Economic Journal* 103(419):868. [Princeton-hosted PDF](https://www.cs.princeton.edu/courses/archive/spr09/cos444/papers/kagel_levin93.pdf)
  - Second-price auctions, pooled (Table 2), with "equal" meaning within $0.05:

    | Market size | Bids above value | At value | Below value |
    |---|---|---|---|
    | N = 5 | 67.2% | 27.0% | 5.7% |
    | N = 10 | 57.9% | 32.5% | 9.6% |

  - Bid-function slope ≈ 1.0, with a positive intercept of about $1.08 (s.e. 0.19).
  - Probability of losing money conditional on winning: 25% (N = 5) and 25.5% (N = 10). Overall probability of losing money: 5% and 2.6%. The authors argue this punishment is too weak to teach bidders to stop overbidding.
  - The authors' explanation: the dominant strategy "is not transparent," and sealed-bid feedback is weak.
  - Comparison: in first-price auctions about 90% bid below value. In third-price auctions about 85-90% bid above value.
- **[LAB-in-field] Garratt, Walker & Wooders**, *Experimental Economics* 15:44-57 (2012):
  - Highly experienced eBay buyers and sellers, recruited online, in second-price auctions.
  - 38% of subjects overbid and 41% underbid: no overbidding tendency, unlike student subjects.
  - Subjects with selling experience tended to underbid.
  - Efficiency (surplus captured) was lower than in earlier lab experiments.
  - [EconPapers](https://econpapers.repec.org/RePEc:kap:expeco:v:15:y:2012:i:1:p:44-57); [eScholarship](https://escholarship.org/uc/item/7s72r56p)
- **[LAB re-analysis] Garratt & Wooders (2010)**, *Rev. Industrial Organization*: in Kagel & Levin's data, efficiency rises over time even though overbidding frequency is unchanged, because the *variability* of overbids falls. [Springer](https://link.springer.com/doi/10.1007/s11151-010-9255-7)
- **[LAB] Cooper & Fang (2008):** cited for the "spite" hypothesis, which reads overbidding in second-price auctions as a deliberate attempt to lower rivals' surplus. Only a secondary description was found. [NBER WP citing it](https://www.nber.org/system/files/working_papers/w13699/revisions/w13699.rev0.pdf)

### Inferences
- **Transfer: moderate to strong.** The tile game uses the same second-price format.
  - Rivals who overbid (as humans do 58-67% of the time) mostly hurt themselves when they win. But in a second-price auction, a rival's overbid raises the price **our bot** pays when it wins.
  - The bot should expect clearing prices somewhat above "fair" for contested tiles and simply decline them.
- If rivals are bots or experienced players behaving like the eBay group (no net overbid, some underbid), clearing prices will be low. This matches the observed "rivals buy cheaply." Our bot is the outlier overbidder.
- **The budget amplifies the cost.** In a one-shot lab auction an overbid costs at most the surplus of one item. With a fixed 100-currency budget, every overpayment removes future tiles. A rule like "bid ≤ estimated value − shadow price of money" is needed, so bidding *below* single-item value is correct (see Q5, the Vickrey-with-budget point).
- **Spite transfers (weak to moderate):** blocking a rival's key letter is a legitimate reason to overbid in a 6-player game. But in a second-price auction, if you set the price without winning, the cost falls entirely on the rival who wins. "Price-setting" bids that make rivals pay more are cheap for the bot if it loses, and costly if it accidentally wins.

### Gaps
- Garratt et al. sample size and the size of over- and underbids were not retrieved.
- No lab study was found of *sequential* second-price auctions with budgets that measures overbidding across rounds, the closest experimental analogue to our game.

## Q8. Poker bankroll and Kelly-style sizing: useful for sizing bids over a 68-round horizon with reinvested income?

### Takeaway
Kelly (maximize expected log wealth) gives the fastest long-run growth when gains are reinvested. **Betting more than Kelly lowers growth, and betting about twice Kelly drives growth to zero**, which describes our bot's early overspending. Half-Kelly keeps about 75% of the growth with far less risk. But Kelly is the wrong *terminal* objective here, because leftover money is worthless. It is useful only as a cap on early "investment" spending while income compounds, and must give way to spend-to-zero near the end.

### Cited Findings
All from MacLean, Thorp & Ziemba, "Good and bad properties of the Kelly criterion" [SIM/THEORY]. [Berkeley-hosted PDF](https://www.stat.berkeley.edu/~aldous/157/Papers/Good_Bad_Kelly.pdf); published version in *Quantitative Finance* 2010 via [eScholarship](https://escholarship.org/content/qt5mr5k8qj/qt5mr5k8qj.pdf).

- Maximizing E[log wealth] asymptotically maximizes the growth rate, minimizes the time to reach large goals, and maximizes median wealth.
- **"It never pays to bet more than the Kelly strategy"**: risk rises and growth falls. For processes close to continuous time, the growth rate becomes zero (plus the risk-free rate) at exactly **twice** the Kelly bet.
- Blackjack example (2% edge, p = 0.51):

  | Kelly fraction | P(double before halving) | Relative growth |
  |---|---|---|
  | 0.1 | 0.999 | 0.19 |
  | 0.2 | 0.998 | 0.36 |
  | 0.5 | 0.89 | 0.75 |
  | 1.0 | 0.67 | 1.00 |
  | 2.0 | 0.50 | 0.00 |

  The table was reconstructed from garbled PDF extraction. Values are consistent with the known half-Kelly ≈ 75%-growth property.
- **Short horizons are risky even with an edge.** 700 wagers, all with a 14% advantage, can still turn $1,000 into $18 under full Kelly, while 16.6% of the time full Kelly reaches at least $100,000. Half Kelly: worst case about $145, and only 0.1% of the time $100,000+.
- **Bad property:** with any fixed fraction f, equal wins and losses leave you behind: W₂ₙ = W₀(1 − f²)ⁿ. Kelly bets can also be very large fractions of wealth when the edge is big; one optimal Breeders' Cup bet was 64% of wealth.
- Fractional Kelly (a blend of Kelly and cash) trades growth for security. [MacLean, Thorp, Zhao & Ziemba 2011 summary](https://eprints.lse.ac.uk/119002/1/dp_52.pdf)

### Inferences
- **Transfer: moderate early, weak late.** Kelly applies when (a) wealth is reinvested and (b) the goal is long-run growth. In our game, (a) holds: tiles generate word income, which buys more tiles. But (b) fails: the horizon is about 68 auctions and terminal cash is worth zero. The objective is final *score*, not log wealth.
- **Practical mapping:**
  - Treat a tile purchase as an "investment" whose return is the expected word income it enables.
  - Early in the game, cap total spending per round at a *fraction* of the Kelly-like stake. Half-Kelly is a reasonable default: about 75% of the growth, much lower risk of being broke.
  - The bot's current behavior (large early bets, then broke) is the "2× Kelly" regime: high variance and near-zero growth.
- **Late game:** as remaining auctions → 0, the value of holding cash → 0, so the bid fraction should rise toward "spend everything on the best remaining marginal value."
  - A simple schedule: max bid fraction of cash = min(1, k ÷ remaining auctions in which you expect to need tiles).
  - This is equivalent to the pacing rule in Q1 and approaches all-in at the end.
- The W₂ₙ = W₀(1 − f²)ⁿ result explains why large fixed fractions erode a budget even with break-even outcomes. With f = 0.3 per tile and alternating good and bad buys, the bot loses about 9% of its effective bankroll every two auctions.

### Gaps
- No source was found applying Kelly to auction budget pacing with a finite horizon and worthless terminal cash. The mapping above is inference.
- The game's actual return-on-tile distribution (income per currency spent) is unknown, so the "edge" needed to compute a Kelly fraction must come from the project's own simulations.

## Synthesis question: which lessons transfer most strongly to the bot, and what do they imply?

### Takeaway
The strongest lessons come from budget-constrained sequential settings (fantasy auctions, spectrum budgets, declining-price markets). All point the same way: **budget-limited bidders who front-load overpay, and patient bidders who keep cash and buy substitutes after rivals have spent get cheaper units.** Our bot shows the documented human bias (overpay for the first 2-3 wins). Rivals behave like the SpectrumCo and declining-price "patient buyer."

### Cited Findings
- Early overpayment for the first 2-3 wins is a measured pattern among budget-constrained human bidders. [Boudreau & Shunda 2016](https://ideas.repec.org/a/eee/soceco/v62y2016icp8-22.html)
- Items that come up after rivals' needs and budgets are depleted sell below value 52-84% of the time (15 drafts, 2,742 player sales). [Fantasy Footballers](https://www.thefantasyfootballers.com/auction/fantasy-football-the-impact-of-nomination-order-in-auction-salary-cap-drafts)
- Successive identical units sell about 2% cheaper each (roses, 7,058 transaction pairs), and the decline is steeper as supply runs out. [van den Berg et al.](https://papers.tinbergen.nl/99074.pdf)
- Final prices are forecastable from aggregate budgets. Substitutes of contested items go at steep discounts. Bidding true value is wrong when the budget binds. [Bulow, Levin & Milgrom](https://www.nber.org/papers/w14765.pdf)
- Betting about 2× Kelly gives zero growth; half-Kelly keeps about 75% of growth. [MacLean, Thorp & Ziemba](https://www.stat.berkeley.edu/~aldous/157/Papers/Good_Bad_Kelly.pdf)
- A speculate-then-commit drafting rule (capped synergy bonus, commitment threshold) approximates expert human drafting. [Ward et al.](https://export.arxiv.org/pdf/2009.00655)

### Inferences
Concrete design implications, ranked by evidence strength:
1. **Budget pacing with a shadow price of money (strong).**
   - Bid = min(marginal tile value − λ, cash cap).
   - λ (the value of keeping 1 currency) is high early and falls toward 0 as auctions run out.
   - The cash cap per auction is about cash × (tiles still needed ÷ expected winnable auctions remaining), scaled up near the end.
   - The aim is to target rivals' tile count (about 2× ours) at lower prices.
2. **Room price index (strong).** Forecast clearing prices from observed rival cash and income, as in exposure-based forecasting and the Rotoman inflation calculator. Log the actual clearing price per round and per letter to learn whether this game's price path declines or rises with income.
3. **Substitute and option-value discount (strong).** For letters with high remaining supply, bid below immediate value, because more copies are coming. Pay up only for scarce letters (last U, last vowel, a rare letter that completes a word).
4. **Speculate-then-commit (moderate).** Buy flexible, common tiles cheaply until a target word passes a completion threshold. Then add a capped completion bonus to its missing letters only.
5. **Don't signal the target (moderate).** Keep bids on target letters near generic value until the final missing tile, to avoid rivals blocking or bidding up.
6. **Expect rivals' overbids on contested tiles and walk away (moderate).** In second-price auctions a rival's overbid sets your price when you win.
7. **End-game: spend to zero (strong, by game rules).** Fantasy and PKL budgets are almost fully spent (₹4.99 of ₹5 crore). Unspent money is waste. The final rounds should convert all cash into the highest marginal-value tiles.

### Gaps
- Every source studies settings without mid-auction income. Whether this game's price path rises (income-driven, affiliated values) or falls (declining-price anomaly) must be measured in the project's own simulation logs.
- No source covered 6-player sealed second-price sequential auctions with complementary items and reinvested income. All recommendations above are inferred by combining sources.
