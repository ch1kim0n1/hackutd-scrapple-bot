# Opponent Modeling, Simulator Calibration, and Live Parameter Tuning for a 6-Player Sequential Vickrey Letter-Auction Bot

Scope note: this file covers simulator calibration, rival modeling, rating dynamics, noisy tuning, and off-policy evaluation. Facts from the local match archive come from an analysis script run during this research on `data/learning/matches/*.json` (359 matches) and `data/learning/evolution.jsonl`. They are cited as "[local archive]", meaning `/Users/pomoika/Documents/GitHub_repo/scrabble/data/learning/`. Everything else cites external sources.

**Key local data fact that changes several answers:** every archived auction record contains both `paid` (the Vickrey price, i.e. the second-highest bid) **and** `topBid` (the winner's bid), plus the winner's identity. topBid is present in 100% of 24,417 auctions. So the data contain the **top two order statistics of every auction**, not only the winning bid. Rivals' losing bids below second place, and starting tiles, are still unobserved. Other local facts [local archive]:
- All 359 matches are Vickrey, rack size 5, 1000 ms per auction. 357 matches have 6 players.
- There are 242 distinct table compositions among 359 matches; the most common composition occurs only 12 times.
- 99.5% of tiles sell. Mean `paid` = 10.6 (median 9). Mean `topBid` = 15.1. The topBid − paid gap has mean 4.48, median 3 and p90 10, and is 0 (a tie at the top) in 11.9% of auctions.
- Leading rivals (n = matches, average rank, rank SD, win rate, mean score ± SD, mean ending balance):
  - bot 114: n=295, avg rank 2.24, SD 1.23, win 32%, score 136 ± 67, balance 53
  - bot 18: n=211, avg rank 2.27, SD 1.56, win 45%, score 121 ± 59
  - bot 138: n=40, avg rank 1.79, SD 0.97, win 53%, score 102 ± 18
  - bot 107: n=121, avg rank 2.47, win 29%
  - bot 88: n=67, avg rank 2.49, win 36%
  - bot 62: n=161, avg rank 3.08, win 11%, score 104 ± 39
- Our bot (166): n=21 archived matches, avg rank 3.62, rank SD 1.32, win 5%, score 75.5 ± 19.1, ending balance 21.
- Latest holdout gate in evolution.jsonl: n=20 paired seeds, mean paired fitness gain 0.264, lower95 −0.134. That implies a paired-difference SD of about 0.83 fitness units.

---

## 1. Simulator calibration: how to fit agent-based or game simulators to observed data, and which summary statistics a calibrated rival should reproduce

### Takeaway
Treat each rival model as a parameterized simulator and fit it in two layers:
1. A direct, likelihood-based fit of the rival's **bid function**. This is possible because the top two bids of every auction are observed.
2. A **simulated-minimum-distance (method of simulated moments) or ABC check** that the fitted rival reproduces match-level moments, including score level (~100–136), score spread, tiles bought, price paid, ending balance, word lengths and timing, and rank distribution.

Then train against a *posterior/randomized* family of rivals (adaptive domain randomization) rather than a point estimate. Measure the remaining sim-to-real gap as the "simulation optimization bias".

### Cited Findings
- Simulated minimum distance (SMD) is a family that includes indirect inference, the method of simulated moments, and simulated annealing; BACCO and ABC are the two prominent Bayesian frameworks. Carrella, Bailey and Madsen propose choosing summary statistics automatically. — [JASSS 23(1)7, Carrella et al. 2020](https://www.jasss.org/23/1/7.html)
- The simplest ABC is rejection ABC: run the simulator with parameters drawn from priors and keep draws whose simulated summaries are close to the observed ones. ABC for agent-based models typically needs a very large number of runs, so computational efficiency is the main constraint. — [JASSS 23(1)7](https://www.jasss.org/23/1/7.html); [Duswald et al., arXiv 2405.13905](https://arxiv.org/pdf/2405.13905)
- Grazzini, Richiardi & Tsionas (JEDC 2017) compare Bayesian estimation (kernel-density likelihood + MCMC, parametric likelihood approximations, ABC) with SMD, and apply it to a 9-parameter behavioural macro model. They note that SMD/MSM needs the summary statistics to be "selected in advance", whereas full Bayesian likelihood approaches exploit all the information. — [Grazzini, Richiardi, Tsionas, "Bayesian estimation of agent-based models"](https://eprints.lancs.ac.uk/id/eprint/84557); [working paper PDF](https://www.nuffield.ox.ac.uk/economics/Papers/2015/AB-v26.pdf)
- Grazzini & Richiardi (2013/2015) set out the conditions under which SMD estimators of agent-based models are consistent. — [econpapers RePEc:uto:dipeco:201335](https://econpapers.repec.org/RePEc:uto:dipeco:201335)
- An HPC–ABC–SMC (sequential Monte Carlo) framework produces posterior distributions rather than point estimates for agent-based models. — [JASSS 2025/2026, Li, Ge, Lomax, Polhill (IDEAS)](https://ideas.repec.org/a/jas/jasssj/2025-150-2.html)
- **BayesSim** (Ramos, Possas, Fox, RSS 2019) takes a black-box simulator plus real trajectories and uses likelihood-free inference (a mixture-density random-Fourier network) to get a posterior over simulator parameters. Domain randomization drawn from that posterior outperformed uniform-prior randomization in its experiments. — [BayesSim arXiv 1906.01728](https://arxiv.org/pdf/1906.01728); [RSS XV](https://roboticsproceedings.org/rss15/p29.html)
- **Domain randomization** (Tobin et al. 2017) randomizes simulator properties so that reality looks like one more variation. It gave the first reported transfer of a network trained only on simulated RGB images to real robotic control. — [arXiv 1703.06907](https://arxiv.org/pdf/1703.06907)
- **SPOTA** (Muratore et al., CoRL 2018; TPAMI 2021) defines the **Simulation Optimization Bias**: the overfitting that occurs when a policy optimized on a slightly wrong simulator exploits its modeling errors. SPOTA estimates that bias and uses it as a stopping criterion and transferability measure, wrapping existing policy search. — [Muratore et al. CoRL 2018](https://proceedings.mlr.press/v87/muratore18a.html); [TPAMI preprint](https://ar5iv.arxiv.org/html/1907.04685)
- Local evidence of the gap: simulated top-rival models score ~58–69 points (user-reported), while the archived leaders score 136 ± 67 (bot 114), 121 ± 59 (bot 18) and 102–104 (bots 138 and 62). The current gate's 20-seed holdout shows baseline mean score 71.7 and mean rank 2.15 in sim, against a real archived mean rank of 3.62 for our bot. The simulator therefore makes us look roughly 1.5 places better than reality. — [local archive]

### Inferences
- **Fit the bid function by maximum likelihood first; use moment matching only as a check.** We observe for each auction the winner's identity and bid (topBid), and the second-highest bid (paid), without its owner. Rival *j*'s per-auction likelihood under a bid model b_j ~ F_j(·|state; θ_j) is:
  - f_j(topBid | s) if j won;
  - otherwise, a censored term F_j(paid | s) (j's bid ≤ paid);
  - plus, for the auction as a whole, a mixture over which loser set the price: Σ_{k≠winner} f_k(paid) Π_{l∉{k,winner}} F_l(paid).

  This is a standard censored/Tobit-style order-statistic likelihood. It is cheap to maximize on a laptop for about 9 parameters per rival.

  The state s should use the rival's *known* public state: tiles bought, money spent, and words played (which reveal starting tiles retroactively). It should integrate over its unknown starting tiles using the bag composition. Likelihood-based fitting needs far fewer simulations than ABC.
- **Calibration targets (summary statistics) per top rival.** Each should be matched within roughly ±1 standard error of the archive value:
  1. Final score: mean and SD, and also quantiles. Score SD is large: 59–67 for bots 114 and 18.
  2. Rank distribution and win rate.
  3. Tiles bought per match, overall and by match phase (early/mid/late auctions).
  4. Mean and quantiles of price paid, per letter class (vowel, common consonant, high-value letter).
  5. Distribution of the rival's winning bid (topBid) relative to the price (paid) when it wins. This is the overbid margin and reveals bid aggressiveness.
  6. Share of auctions where the rival sets the price: not directly identified, but checkable in aggregate through the paid-price distribution.
  7. Ending balance (local means range from 8 to 53 across leaders).
  8. Word count, word-length distribution, and timing of plays (rack size at play, balance at play). The codebase already profiles median word length, rack at play, and balance at play.
  9. Points per tile bought and points per coin spent.
  10. Table-level moments: the topBid − paid gap distribution (median 3, 11.9% zero) and the mean price path across the ~68 auctions. These capture interaction between bidders, not only marginal behavior.
- **ABC/SMC practicality.** Rejection-ABC over ~9 rival parameters needs on the order of 10^4–10^6 simulated matches depending on tolerance; SMC-ABC needs fewer. This is practical on a laptop *only* if one simulated match runs in milliseconds; sim speed was not measured here. Use SMD/MSM with a diagonal or bootstrap weighting matrix as the cheap first pass. Use ABC-SMC only if posterior uncertainty is needed for domain randomization.
- **Sim-to-real gap metric to track in CI.** For each rival model, compute a standardized distance between simulated and archive moments: Σ_k ((m_sim,k − m_real,k)/se_k)². Also track the **rank-prediction gap**: our bot's mean rank in calibrated sim against the same table compositions, compared with live (3.62 ± 0.29 SE from 21 matches).

  The promotion gate should refuse to run until this gap falls inside a tolerance. One option is to require |sim rank − live rank| < 0.3, the size of the effect being tuned for. This directly operationalizes Muratore's simulation optimization bias.
- **Domain randomization.** After fitting, sample rival parameters from the posterior (or the MLE ± a bootstrap covariance), and sample table compositions from the empirical composition distribution (242 distinct tables of 359). Promote only candidates that win robustly across that distribution. This guards against the exploited-modeling-error failure that SPOTA describes.

### Gaps
- No source found that calibrates *game-playing bots in sequential auctions* specifically with ABC/MSM. The methods above are transferred from economics and robotics.
- Simulator runtime per match is unknown, so feasible ABC budgets could not be computed.
- Optimal summary-statistic selection (e.g., semi-automatic ABC; Fearnhead & Prangle 2012) was not verified in this session.

---

## 2. Empirical game-theoretic analysis (EGTA, PSRO, Nash averaging, α-Rank): building a population of rival policies and evaluating against a meta-strategy

### Takeaway
Replace "one fixed rival profile" with a small empirical game:
- a population of K calibrated rival policies (fitted leaders, posterior samples of them, historical versions of our own bot, and simple archetypes);
- payoffs (expected PL rating gain, or rank) estimated by simulation for each multiset of 5 rival seats;
- a meta-distribution over rivals: the empirical table-composition frequency for exploitation, plus a max-entropy-Nash or α-Rank mixture for robustness.

Candidates are promoted on their payoff against that mixture. PSRO-style best-response loops are possible offline but are not needed for 9 parameters.

### Cited Findings
- EGTA builds game models from simulation data rather than a declarative specification. It iteratively analyzes the empirical game to decide which new strategies to add and which profiles to simulate. Wellman's original work estimated payoffs for combinations of bidding strategies from a parametric family and found approximate Nash equilibria among them. — [Wellman, Tuyls, Greenwald, "Empirical Game-Theoretic Analysis: A Survey", JAIR / arXiv 2403.04018](https://arxiv.org/abs/2403.04018)
- EGTA survey sample-complexity bound. For an ε-uniform approximation of all payoffs with probability ≥ 1−δ (Bonferroni-corrected), you need **m ≥ c²·ln(2|Γ|/δ)/(2ε²) samples per profile** (Hoeffding), where c is the payoff range and |Γ| the number of payoff parameters. The Bennett-based bound is m ≥ 2·ln(2|Γ|/δ)·(c/(3ε) + ‖v‖∞/ε²) and is much tighter when variance is low. The experiments use δ=0.05. — [EGTA survey, ar5iv 2403.04018](https://ar5iv.labs.arxiv.org/html/2403.04018)
- **Role symmetry:** players in a role share strategy sets and payoffs, and payoffs depend only on counts of each strategy in each role. This sharply reduces the number of profiles. The survey's worked example ran 10,000 simulations per distinct profile of a 3-player, 3-strategy game. — [EGTA survey](https://ar5iv.labs.arxiv.org/html/2403.04018)
- A strategy's deviation payoff against a population mixture σ is the probability-weighted average of profile payoffs, weighted by Pr(profile | σ). — [EGTA survey](https://ar5iv.labs.arxiv.org/html/2403.04018)
- PSRO combines game-theoretic analysis with simulation (an EGTA instance). The main challenge is assembling small strategy subsets that still represent the full game. α-Rank has been adopted as a PSRO meta-solver. — [Bighashdel et al., PSRO survey, IJCAI 2024](https://ijcai.org/proceedings/2024/880.md); [PSRO survey review](https://www.themoonlight.io/review/policy-space-response-oracles-a-survey) (secondary summary)
- **Nash averaging** (Balduzzi, Tuyls, Perolat, Graepel, NeurIPS 2018) plays a meta-game on the evaluation data, which has a unique maximum-entropy Nash equilibrium. It is invariant to redundant (duplicated or weak) agents, so including all available agents does no harm. An agent's Elo rating can be inflated by adding many copies of an agent it beats. — [Re-evaluating Evaluation, arXiv 1806.02643](https://arxiv.org/pdf/1806.02643); [NeurIPS page](https://papers.nips.cc/paper/2018/hash/cdf1035c34ec380218a8cc9a43d438f9-Abstract.html)

### Inferences
- **Profile count for our setting (combinatorics).** With us in one seat and 5 rival seats filled from K rival types (symmetric among rivals), there are C(K+4, 5) distinct profiles. K=4 gives 56, K=6 gives 252, and K=8 gives 792. Simulation is cheap, so K=6–8 is laptop-feasible even at a few hundred seeded matches per profile.

  It is cheaper still to Monte-Carlo-sample tables from the meta-distribution rather than enumerating profiles: estimate E_{table~σ}[payoff] directly with stratified sampling over seat counts.
- **Hoeffding numbers for our payoffs.** For rank in [1,6] (c=5), ε=0.1 and δ=0.05 with a single parameter, m ≥ 25·ln(40)/(0.02) ≈ 4,600 samples per profile. This is conservative; the Bennett/empirical-variance bound with rank SD ~1.3 is several times smaller. In practice, estimate SE directly: SE = SD/√m ≈ 1.3/√m, so m=400 gives SE ≈ 0.065 rank.
- **Recommended meta-distribution.** Use a mixture of:
  - (a) the **empirical table distribution**: rival frequencies from the archive (bot 114 appears in 295/359 matches, bot 18 in 211, bot 62 in 161, bot 107 in 121), which targets the real server;
  - (b) a **max-entropy Nash or α-Rank** mixture over the population, which guards against rivals adapting or new bots entering.

  A 70/30 weighting is a reasonable starting point (judgment, not sourced).
- **Population ingredients.** Include:
  - each calibrated leader model (MLE plus 2–3 posterior/bootstrap samples, as domain randomization);
  - our previous champions, since self-play-like robustness matters because rivals may copy successful styles;
  - the existing "aggressive", "patient" and "starter" archetypes as low-weight sanity checks.

  Nash averaging makes redundant weak archetypes harmless.
- **PSRO practicality.** A full PSRO loop (train a best response, add it to the population, re-solve the meta-game) is *practical in a reduced form*. The "best-response oracle" is simply CMA-ES/BO over our 9 parameters against the current meta-mixture. Deep-RL PSRO is **impractical here**.

### Gaps
- Deviation-preserving reduction (Wiedenbeck & Wellman 2012) and bootstrap regret confidence intervals for EGTA (Wiedenbeck et al. 2014) were not retrieved, so their formulas are not given.
- α-Rank's exact definition and parameters (Omidshafiei et al. 2019) were not fetched; only secondary mention.

---

## 3. Inferring bids and valuations from censored auction data (Guerre–Perrigne–Vuong, Athey–Haile): what does the observed price identify in second-price auctions?

### Takeaway
In a static symmetric independent-private-values (IPV) second-price auction, the transaction price alone (the (n−1):n order statistic) nonparametrically identifies the value distribution. With **asymmetric** bidders, identification needs the price plus the winner's identity, or, in a second-price auction, the **highest bid plus the winner's identity** (Athey & Haile 2002, Theorem 2).

Our archive has *both* top bids and the winner's identity, which is the richest case Athey–Haile consider. The caveat is that ours are *sequential* auctions with budgets and word complementarities, so bids are state-dependent strategic bids, not static values. Model bids conditional on state (a structural "bid function") rather than recovering "values".

### Cited Findings
- Athey & Haile, "Identification of Standard Auction Models", Econometrica 70(6):2107–2140 (2002). The simplest model, symmetric IPV, is nonparametrically identified "even if only the transaction price from each auction is observed". Richer models need extra information:
  - the winner's or other bidders' identities;
  - bids beyond the transaction price;
  - exogenous variation in the number of bidders;
  - bidder covariates.

  The private-values model can be tested against common values even when neither is identified. — [Econometrica abstract](https://econometricsociety.org/publications/econometrica/2002/11/01/identification-standard-auction-models); [paper PDF](https://gsb-faculty.stanford.edu/susan-athey/files/2022/04/ident_0901_0.pdf)
- Athey–Haile **Theorem 1:** in symmetric IPV, F_U is identified from the transaction price. The (i:n) order statistic of an i.i.d. sample has a distribution that uniquely determines the parent distribution, and the transaction price equals U^(n−1:n). — [Athey & Haile PDF](https://gsb-faculty.stanford.edu/susan-athey/files/2022/04/ident_0901_0.pdf)
- Athey–Haile **Theorem 2:** in asymmetric IPV, assuming continuous F_Ui with common support, each F_Ui is identified in a second-price auction if either:
  - (a) the transaction price B^(n−1:n) and the winner's identity are observed (via Meilijson 1981); or
  - (b) the highest bid B^(n:n) and the winner's identity are observed.

  — [Athey & Haile PDF](https://gsb-faculty.stanford.edu/susan-athey/files/2022/04/ident_0901_0.pdf)
- When the number of bidders is known, the value distribution is identified from one order statistic and can also be identified from two (the highest and second-highest, as eBay-type data may provide). Song (2003/2004) handles an unknown number of bidders and censored top bids. — [FTC working paper 272 (Song-based)](https://webarchive.library.unt.edu/eot2008/20080916135136/http://ftc.gov/be/workpapers/wp272.pdf); [Hu & Shum, Penn working paper](https://economics.sas.upenn.edu/sites/default/files/filevault/event_papers/Econometrics041420080.pdf); [Mukherjee, Patra, Khare, "Deconvolution from two order statistics", arXiv 2403.17777](https://arxiv.org/pdf/2403.17777)
- Ad-tech analogue with the *opposite* censoring. In real-time bidding, a losing bidder never sees the winning price. Wu, Yeh & Chen (KDD 2015) fit censored regression (survival analysis / econometrics) to winning prices, then found its assumptions violated on real RTB data and used a winning-rate mixture to mitigate this. — [Wu, Yeh, Chen KDD 2015 (dblp)](https://dblp.dagstuhl.de/rec/conf/kdd/WuYC15.html); [Wu dissertation, NTU](https://tdr.lib.ntu.edu.tw/handle/123456789/7399?locale=en)
- Local data: topBid is present for 100% of 24,417 auctions. The mean top-two gap is 4.48 and the median 3; 11.9% are ties. — [local archive]

### Inferences
- **What our data identifies, auction by auction.** We know the winner, the winner's bid, and the second-highest bid. For a rival who did not win, we know only that its bid ≤ paid, and for one unknown loser it equals paid. This supports the censored order-statistic likelihood in Section 1:
  - exact density for the winner;
  - a mixture for "who set the price";
  - CDF terms for the rest.
- **Max competing bid is known exactly in every auction.** Let m = max_{j≠us} b_j. If we won, m = paid. If we lost, m = topBid, the winner's bid. This holds whether or not we were the second-highest bidder. Section 7 uses this for counterfactual replay.
- **Why not GPV.** GPV's inversion v = b + G(b)/((n−1)g(b)) is for *first-price* auctions. It is not needed here because Vickrey bidding is truthful in a single static auction.
- **But sequential and budgets break "bid = value".** In a sequence of 68 auctions with budgets and complementarities, a rival's bid reflects continuation value: its rack's word potential and remaining money. So:
  - parameterize b_j = g_θj(public state of j, letter, auction index, balance), not a static value distribution;
  - include an "opponent-awareness" term if rivals react to others' racks.

  The Athey–Haile results then justify that with winner identity plus two order statistics, an asymmetric per-rival bid distribution *conditional on state* is identifiable, provided state is controlled for and the rival set is known (it is: n=6, identities known).
- **Starting tiles are unobserved but partially revealed.** Words a rival plays reveal which starting tiles it must have held, since tiles used minus tiles bought gives the starting tiles used. Unplayed starting tiles stay latent; integrate them out with the bag's composition (EM or Monte Carlo).

### Gaps
- No source located that extends Athey–Haile identification to *sequential multi-unit auctions with budget constraints and complementarities* (e.g., Jofre-Bonet & Pesendorfer 2003 on dynamic auctions was not retrieved). The bid-function approach above is an inference, not a cited result.
- Guerre–Perrigne–Vuong (Econometrica 2000) was not fetched; only the standard form of its inversion is stated, and it is irrelevant for Vickrey.

---

## 4. Opponent modeling in imperfect-information games: poker bots, exploitation vs safety, small-sample classification. Does exploitation help in six-player games?

### Takeaway
State-of-the-art six-player poker (Pluribus) deliberately does **not** exploit or adapt, because opponent exploitation needed too many samples and opens you to counter-exploitation. In multiplayer games, equilibrium guarantees also do not hold.

Our situation differs: rivals are a small set of **recurring, probably fixed-policy bots** with hundreds of archived matches (114: 295, 18: 211, 62: 161). That is a regime where population-level exploitation, meaning best-responding to a calibrated meta-mixture, is low-risk. Per-match online adaptation is high-variance; restrict it to "safe" small deviations or Bayesian classification among a few archetypes.

### Cited Findings
- Pluribus (Brown & Sandholm, Science 2019) learned by self-play against five copies of itself and adds a limited-lookahead imperfect-information subgame search. It beat elite professionals over 10,000 hands. — [Science abstract (ADS)](https://ui.adsabs.harvard.edu/abs/2019Sci...365..885B); [ScienceDaily](https://sciencedaily.com/releases/2019/07/190711141343.htm)
- Search summary of the Pluribus paper:
  - Pluribus plays a fixed strategy that does not adapt to observed opponent tendencies;
  - exploitative non-equilibrium strategies open the player to counter-exploitation;
  - existing opponent-exploitation techniques need too many samples to compete outside small games;
  - its algorithms are not guaranteed to converge to Nash outside two-player zero-sum.

  — [Pluribus paper copy, NSF PAR](https://par.nsf.gov/servlets/purl/10119653) (characterization via search summary; full text not re-read here)
- Ganzfried & Sandholm, "Safe Opponent Exploitation" (ACM TEAC 3(2), 2015), characterizes deviations from equilibrium in repeated zero-sum games that exploit an opponent model while keeping a safety margin. The ε-safe best response is computed by LP over the whole game, which limits scalability. — [Ganzfried & Sandholm (CMU copy)](https://www.gwern.net/docs/www/www.cs.cmu.edu/dbbe11e94da27950441bb4654685aec49697c4e6.pdf) (search summary)
- Safe Exploitation Search (Liu et al., NeurIPS 2022) interpolates between equilibrium and exploitation in real time and adapts online to a changing opponent model. — [NeurIPS 2022 paper](https://proceedings.neurips.cc/paper_files/paper/2022/file/b12a1d1014e952e676f5d6931d03241a-Paper-Conference.pdf)
- Ge et al. (ICML 2024) define "adaptation safety": the strategy must be no more exploitable than if it ignored exploitation. — [Safe and Robust Subgame Exploitation, ICML 2024](https://mlanthology.org/icml/2024/ge2024icml-safe/)
- Southey et al., "Bayes' Bluff" (UAI 2005), place a Bayesian (Dirichlet-prior) model over opponent strategies. They argue that if only two to three hundred hands are played, opponent modeling must work from very small data. They test on a reduced poker game and on Texas hold'em with an informed prior. — [arXiv 1207.1411](https://arxiv.org/abs/1207.1411)

### Inferences
- **Exploitation at the population level is justified here.** The poker arguments against exploitation assume adversarial, adaptive humans and huge game trees. Our rivals are bots with stable versions and hundreds of observed matches each. A calibrated best response to the *empirical* rival mixture is low-risk, because each rival has hundreds of observations, which is far above Southey's 200–300 regime.

  The main risk is rival *version changes*. The codebase already tracks `versionStartedAt`; models should be refit per version and down-weight stale data (e.g., Waupus last seen Oct 25, per README).
- **Safe exploitation recipe (practical).** Keep the champion as the "safe" policy. Allow exploitative parameter shifts only when the predicted gain in calibrated sim exceeds the predicted loss under a worst-case rival in the population, i.e., evaluate against a Nash/α-Rank mixture as well as the empirical mixture. This is Ganzfried-style safety translated to EGTA, and it is an inference, not a cited algorithm.
- **Small-sample in-match classification.** With 6 players and ~68 auctions, per-match online modeling of an *unknown* new bot is noisy. A Bayesian classifier over K archetypes, with a Dirichlet prior and likelihood from each archetype's fitted bid model on the topBid/paid observations, can be updated *after* each match. It is not needed during the match: the server publishes winning bids only after matches end. **In-match adaptation is therefore impossible from bid data**; only auction winners and played words are visible live.
- **Does exploitation help in 6-player games?** No cited study quantifies this for 6-player auction games. The general multiplayer caveat (no Nash guarantee, kingmaking effects) means "equilibrium play" is not a well-defined safe baseline either. Empirical robustness across a population (Section 2) is the practical substitute.

### Gaps
- Pluribus's exact wording and training cost (often reported as ~8 days on 64 cores) could not be verified in this session.
- AIVAT and related variance-reduction methods for poker evaluation (Burch et al.) were not retrieved, though they are likely relevant to live evaluation variance.
- No study found on opponent modeling specifically in sequential multi-unit auction games with bots.

---

## 5. Multi-player game evaluation: how OpenSkill/TrueSkill/Plackett–Luce ratings respond to placement, and what maximizes rating (win share vs average placement)

### Takeaway
Under Weng–Lin Plackett–Luce (OpenSkill's default model), with equal ratings in a 6-player free-for-all, the mean update for finishing in place r is proportional to 1 − Σ_{q=1}^{r} 1/(7−q):

| Place | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Relative μ change | +0.83 | +0.63 | +0.38 | +0.05 | −0.45 | −1.45 |

The rating is therefore **concave in placement**:
- moving from 6th to 5th is worth 1.0 unit;
- moving from 2nd to 1st is worth only 0.2.

**Avoiding last and fifth place is worth far more than extra wins.** Maximize the expected PL score (equivalently, minimize bottom-two finishes) rather than win share. Average rank is a decent but imperfect proxy.

### Cited Findings
- Weng & Lin, "A Bayesian Approximation Method for Online Ranking", JMLR 12 (2011). The Plackett–Luce extension with variance parameters is f(z) = Π_q [e^{θ_q/c} / Σ_{s∈C_q} e^{θ_s/c}]^{1/A_q}, where:
  - c = (Σ_i (σ_i² + β²))^{1/2};
  - C_q = {i : r(i) ≥ r(q)};
  - A_q = |{s : r(s) = r(q)}| handles ties.

  — [Weng & Lin JMLR PDF](https://jmlr2020.csail.mit.edu/papers/volume12/weng11a/weng11a.pdf)
- Algorithm 4 (PL update). Let p̂_{i,C_q} = e^{μ_i/c}/Σ_{s∈C_q} e^{μ_s/c}. For each q with r(q) ≤ r(i):
  - δ_q = (σ_i²/(c·A_q))·(1 − p̂_{i,C_q}) if q = i, and −(σ_i²/(c·A_q))·p̂_{i,C_q} otherwise;
  - η_q = γ_q·(σ_i²/(c²·A_q))·p̂_{i,C_q}(1 − p̂_{i,C_q}).

  Then μ_i ← μ_i + Σ_q δ_q and σ_i² ← σ_i²·max(1 − Σ_q η_q, κ). — [Weng & Lin PDF](https://jmlr2020.csail.mit.edu/papers/volume12/weng11a/weng11a.pdf)
- Experimental defaults: initial μ = 25, σ² = (25/3)², β² = (25/6)², κ = 0.0001. The paper sets γ_q = σ_i/c_iq in its main table. — [Weng & Lin PDF](https://jmlr2020.csail.mit.edu/papers/volume12/weng11a/weng11a.pdf)
- Accuracy and speed: on "Free for All" data, prediction error was 36.31% for PL, 35.44% for BT-full and 35.58% for TrueSkill. Over all games the error rate was 30.59% for BT-full against 30.74% for TrueSkill. TrueSkill took 13 s against 1.2 s for BT-full in F#, and needs over 500 lines of code against under 100. — [Weng & Lin PDF](https://jmlr2020.csail.mit.edu/papers/volume12/weng11a/weng11a.pdf)
- OpenSkill implements Weng–Lin; its recommended model extends PL (Guiver & Snelson 2009) with variance parameters. — [OpenSkill paper, arXiv 2401.05451](https://arxiv.org/pdf/2401.05451); [JOSS openskill.py](https://joss.theoj.org/papers/10.21105/joss.05901.pdf)
- The site's displayed rating is reconstructed locally as 1500 + scale·(μ − 25), with a provisional cut-off when scale·σ > 175. — [local `src/history.ts`](/Users/pomoika/Documents/GitHub_repo/scrabble/src/history.ts)

**Numerical results** (computed in this session by implementing Algorithm 4 with γ_q = σ_i/c, β = 25/6, six players, no ties):

| Scenario | 1st | 2nd | 3rd | 4th | 5th | 6th |
|---|---|---|---|---|---|---|
| All μ=25, σ=25/3 | +2.54 | +1.93 | +1.17 | +0.15 | −1.37 | −4.41 |
| All μ=25, σ=3 | +0.60 | +0.45 | +0.27 | +0.04 | −0.32 | −1.04 |
| All μ=25, σ=1.5 | +0.17 | +0.13 | +0.08 | +0.01 | −0.09 | −0.30 |
| Us μ=25, σ=2; five rivals μ=27, σ=1.5 | +0.31 | +0.25 | +0.17 | +0.06 | −0.10 | −0.47 |

Policy comparisons at σ=2, equal ratings:
- "Boom-bust" (30% wins, 40% last; E[rank] 3.75): E[Δμ] = **−0.10**.
- "Consistent" (5% wins, mostly 2nd and 3rd; E[rank] 2.80): E[Δμ] = **+0.14**.
- Our observed archive placement distribution (1st:1, 2nd:3, 3rd:6, 4th:6, 5th:3, 6th:2 of 21; E[rank] 3.62): E[Δμ] = +0.02.

— [Weng & Lin formula](https://jmlr2020.csail.mit.edu/papers/volume12/weng11a/weng11a.pdf) + [local archive]

### Inferences
- **Fitness function for the gate.** Use the PL expected-rating-gain score directly:

  u(r) = 1 − Σ_{q=1}^{r} 1/(7−q), i.e. [0.833, 0.633, 0.383, 0.050, −0.450, −1.450]

  or the version with actual table ratings. This replaces the current `participants − rank + score/150`, which is linear in rank and so overweights wins relative to rating impact.
- Linear "average rank" treats 1→2 and 5→6 as equal. PL treats 5→6 as **5×** as costly. A +0.3 average-rank gain that comes from fewer last places is worth much more rating than one that comes from more wins.
- **Ordinal / leaderboard.** If the leaderboard sorts by μ − kσ ("ordinal"), σ shrinks only slowly per game under γ = σ/c, so the number of games played also matters. Whether the site uses μ or an ordinal for ranking was not confirmed (local code uses μ for display).
- **Rating vs. rivals.** When rivals are rated higher, beating them gains more (4th place still +0.06 in the scenario above), but last place still dominates the downside.

### Gaps
- The openskill.js default γ ("gamma") function and the default tie margin were not verified from source in this session. Values above assume γ_q = σ_i/c, which affects only σ shrinkage, not the μ-update shape.
- The site's exact rating variant (PL vs Thurstone–Mosteller full/partial pairing, β value) is assumed from the local code comment "site's OpenSkill scale". It was not independently confirmed.
- TrueSkill's own placement response (Herbrich et al. 2007) was not retrieved.

---

## 6. Parameter tuning under noise: CMA-ES, SPSA, Bayesian optimization, successive halving, racing, Thompson sampling, Fishtest SPRT, sample sizes for a +0.3 rank gain, always-valid sequential testing

### Takeaway
Do the search in the **calibrated simulator**, with common random numbers (paired seeds) and a population meta-mixture:
- noisy BO (qNEI-style) or CMA-ES with uncertainty handling, over 9 parameters;
- successive halving / racing to prune candidates.

Use live play only to **confirm 1–3 finalists** with a sequential test. Detecting a +0.3 average-rank gain at rank SD ≈ 1.3–1.5 needs about:
- **117–155 live matches** against a fixed known baseline (one-sample, α=0.05 one-sided, 80% power);
- **~230–310 per arm** for a concurrent two-arm A/B;
- **~100–130 expected matches** with a Wald SPRT (α=β=0.05).

At ~50 matches/hour this is 3–12 hours per decision. An always-valid mSPRT or confidence sequence allows peeking without inflating error.

### Cited Findings
- **Fishtest** uses a GSPRT (unknown parameters replaced by MLEs) with a pentanomial model of game-pair outcomes. Bounds are in "normalized Elo", and test duration depends only on the chosen bounds. — [Fishtest Mathematics](https://official-stockfish.github.io/docs/fishtest-wiki/Fishtest-Mathematics.html); [Fishtest FAQ](https://github.com/official-stockfish/fishtest/wiki/Fishtest-faq)
- Pentanomial statistics (outcomes of *paired* games: ll, ld, dd/wl, wd, ww) were adopted to be more resource-efficient. With SPRT the number of games is not fixed in advance and the expected number is minimized. Typical Stockfish bounds cited:
  - gainer [0, 2] STC and [0.5, 2.5] LTC;
  - non-regression [−1.75, 0.25].

  One simulator example of SPRT(0,5) needed ~42k games. — [chessprogramming SPRT](https://chessprogramming.org/Sequential_Probability_Ratio_Test); [vdbergh/simul](https://github-redirect.dependabot.com/vdbergh/simul) (third-party; check current Fishtest settings)
- Stockfish's original **SPSA** tuning used 30,000–100,000 super-fast games per session, ~100,000 games/week on one machine. Each iteration plays a game pair with Θ+ against Θ−. The tuner README says good gain coefficients c_k and R_k are generally impossible to determine ideally, and recommends simulating with a guess of each parameter's Elo sensitivity. — [zamar/spsa](https://github.com/zamar/spsa); [chessprogramming SPSA](https://chessprogramming.org/SPSA); [talkchess thread](https://talkchess.com/viewtopic.php?p=427895)
- **CMA-ES uncertainty handling** (Hansen et al., IEEE TEVC 2009) re-evaluates a few candidates each generation and counts rank changes. If ranking uncertainty exceeds a threshold, it increases step size (population variance). It needs only a small number of extra evaluations and is implemented as `NoiseHandler` in pycma. Newer variants exist (AR-CMA-ES 2024, RA-CMA-ES). — [pycma NoiseHandler docs](https://cma-es.github.io/apidocs-pycma/cma.optimization_tools.NoiseHandler.html); [AR-CMA-ES arXiv 2409.16757](https://arxiv.org/html/2409.16757v3)
- **Noisy BO** (Letham, Karrer, Ottoni, Bakshy; Bayesian Analysis 2019) derives expected improvement for greedy batch optimization with noisy observations and noisy constraints, approximated by quasi-Monte Carlo. Standard noise heuristics perform poorly at A/B-test noise levels. Facebook routinely tunes up to 20 parameters jointly with batches of up to 50 configurations. — [arXiv 1706.07094](https://arxiv.org/pdf/1706.07094); [Meta engineering blog](https://engineering.fb.com/ml-applications/bayesian-optimization-for-tuning-online-systems-with-a-b-tests/)
- **irace / iterated F-Race** (López-Ibáñez et al., Oper. Res. Perspectives 2016) races configurations, eliminating those that are statistically worse (Friedman test with Conover post-hoc in the source). It adds restarts, truncated sampling for bounds, and elitist racing. — [irace package PDF](https://mlopez-ibanez.r-universe.dev/articles/irace/irace-package.pdf); [RePEc entry](https://econpapers.repec.org/RePEc:eee:oprepe:v:3:y:2016:i:c:p:43-58); [race.R source](https://rdrr.io/github/MLopez-Ibanez/iracelhs/src/R/race.R)
- **Sequential Halving** (Karnin, Koren, Somekh, ICML 2013) is parameter-free fixed-budget best-arm identification, within a doubly-logarithmic factor of the lower bound. — [PMLR v28 karnin13](https://proceedings.mlr.press/v28/karnin13.html)
- **Top-two Thompson sampling** (Russo, Operations Research 2020) is for best-arm identification. Plain TS over-allocates to the apparent best arm; the top-two resampling step fixes this. With an unbiased coin (β=0.5), the exponent is within a factor 2 of the optimal allocation. — [arXiv 1602.08448](https://arxiv.org/abs/1602.08448v4)
- **Always-valid inference.** Johari, Pekelis & Walsh define p-values that stay valid under data-dependent stopping, and show mixture-SPRT p-values trade power against error control efficiently. Confidence sequences (Howard, Ramdas, McAuliffe, Sekhon) generalize the mSPRT nonparametrically. Misspecified parametric confidence sequences can undercover. — [arXiv 1512.04922](https://arxiv.org/pdf/1512.04922v2); [Ramdas lecture notes](https://www.stat.cmu.edu/~aramdas/martingales18/L20-testing.pdf); [arXiv 2212.14411](https://arxiv.org/pdf/2212.14411v1)
- Local variance inputs: our live rank SD is 1.32 (n=21); leaders' rank SDs are 0.97–1.56; a uniform 6-player rank has SD √(35/12) = 1.71. The simulated 20-seed paired gate gave mean 0.264, lower95 −0.134, an implied paired SD ≈ 0.83 fitness units. — [local archive]; [local `src/evolution.ts`](/Users/pomoika/Documents/GitHub_repo/scrabble/src/evolution.ts)

### Inferences
**Sample sizes** (computed with standard normal-approximation formulas; z_{0.95}=1.645, z_{0.80}=0.842, z_{0.975}=1.96). The target is to detect Δ = 0.3 average rank.

| Design | SD = 1.3 | SD = 1.5 | SD = 1.7 |
|---|---|---|---|
| One-sample vs known baseline mean, n = ((z_α+z_β)·SD/Δ)² | 117 | 155 | 199 |
| Two-arm, per arm (one-sided α=0.05, 80% power) | 233 | 310 | 398 |
| Two-arm, per arm (two-sided α=0.05, 80% power) | 295 | 393 | 505 |
| Wald SPRT, α=β=0.05, H0: Δ=0 vs H1: Δ=0.3, E[N] under H1 (≈ same under H0) | ≈100 | ≈132 | — |

- SPRT bounds are ln((1−β)/α) = ±2.94, and E[N] ≈ [(1−β)ln((1−β)/α) + β·ln(β/(1−α))] / (Δ²/(2SD²)). These are Wald's classical approximations, stated here without a fetched source.
- At 50 matches/hour, a two-arm test of a +0.3 effect needs **~10–16 hours** of live play. A one-arm test against the frozen champion's long-run mean needs ~3 hours, but is vulnerable to drift in table composition. Effects smaller than 0.2 rank (n ∝ 1/Δ²; 0.15 rank needs 4× the matches) are realistically **undetectable live**.

**Variance reduction for live tests:**
1. Use the PL score u(r) (Section 5) or rank, not raw score; the score SD of 19–67 is dominated by table strength.
2. **Regression adjustment / stratification on table composition:** regress the outcome on the rivals present (e.g., indicator for bot 114 and 18), which have strong main effects. This is CUPED-style adjustment, a known technique not sourced in this session.
3. **Alternate policies by match (ABAB…) rather than by day**, so both arms see the same table mix and time-of-day. This approximates the pairing that Fishtest gets from game pairs.
4. Exclude matches with missing rivals or disconnections by a pre-registered rule.

**Simulator search procedure (practical on a laptop):**
- (a) Calibrate rivals (Section 1).
- (b) Use **common random numbers**: the same seeds (bag order and rival random draws) for every candidate. The current gate already pairs seeds, giving a paired SD ≈ 0.83. Detecting a 0.26 gain then needs n ≈ ((1.645+0.842)·0.83/0.26)² ≈ 63 paired seeds, not 20; the current 20-seed gate is underpowered.
- (c) Search: CMA-ES with noise handling (λ ≈ 4 + 3·ln 9 ≈ 10 per generation is the standard default — not sourced here), or noisy BO (BoTorch qNEI) with a GP over the 9 dimensions, evaluating each point on 50–200 paired seeds.
- (d) Prune candidates with Sequential Halving or irace racing.
- (e) Re-evaluate the top 2–3 on fresh seeds and on domain-randomized rival posteriors, which guards against the winner's curse and simulation optimization bias.
- (f) Live: SPRT or mSPRT on u(r) with alternation; promote on acceptance of H1, and keep a non-regression test like Fishtest's [−1.75, 0.25] style.

**Practicality labels:**
- *Practical:* CMA-ES/BO in sim; paired seeds; Sequential Halving; SPRT/mSPRT live; Top-two TS across 2–4 live finalists.
- *Impractical here:* Fishtest-scale SPSA on live games (needs 10^4–10^5 games); live irace/F-Race over many configurations; live BO over 9 dimensions (would need thousands of matches).
- *Practical only in sim:* SPSA.

### Gaps
- The exact Fishtest normalized-Elo definition and GSPRT LLR formula were not on the fetched page; they live in linked PDFs that were not retrieved.
- Howard et al.'s primary confidence-sequence paper was not fetched; boundary constants for a bounded-outcome (rank in [1,6]) confidence sequence are therefore not given.
- No source quantifies SPRT expected sample size for *ordinal* 6-player outcomes. The numbers above use a normal approximation on rank.

---

## 7. Off-policy evaluation from logged data: counterfactual replay of new bid rules against logged auctions; how ad platforms do it (Bottou et al. 2013)

### Takeaway
Because each logged auction records the winner's bid and the second-highest bid, we know the **maximum competing bid m** in every auction where we bid. So the *immediate* outcome of any alternative bid b′ is exactly computable:
- win iff b′ > m (ties random);
- pay m.

**Single-auction counterfactuals are exact**, which is better than ad-platform settings where loss-side prices are censored. **Whole-match counterfactuals are biased**, because changing who wins a tile changes:
- rivals' racks and budgets, and so their later bids;
- possibly the rivals' reactions to our rack.

The fix follows Bottou et al.:
- (a) inject small randomization into our live bids, such as a log-normal multiplier, to enable importance-weighted estimates of nearby policies with clipped weights and confidence intervals;
- (b) for larger changes, use hybrid replay-then-simulate with the calibrated rival models after the first divergence.

### Cited Findings
- Bottou et al., "Counterfactual Reasoning and Learning Systems: The Example of Computational Advertising", JMLR 14:3207–3260 (2013). It uses causal inference and importance sampling on data from randomized experiments on Bing's ad placement system to predict the effect of changes. It connects auction theory and ML, and estimates how small interventions displace an equilibrium. — [JMLR page](https://www.jmlr.org/beta/papers/v14/bottou13a.html); [arXiv 1209.2355](https://arxiv.org/pdf/1209.2355)
- **Randomization used:** all mainline reserves are multiplied by m = ρ·e^{−σ²/2 + σε} with ε ~ N(0,1), giving a log-normal multiplier with mean ρ. The main bucket used **ρ = 1, σ = 0.3** (95% of multipliers in [0.52, 1.74]), over 22 million search result pages in five weeks. A second bucket with reserves cut ~18% matched the counterfactual predictions "with high accuracy". — [ar5iv 1209.2355](https://ar5iv.labs.arxiv.org/html/1209.2355)
- **Estimator:** Ŷ* = (1/n) Σ_i ℓ(ω_i)·w_i with w_i = P*(ω_i)/P(ω_i). **Clipped weights:** w̄ = w if P* < R·P, else 0. For outcomes in [0, M], the bias of the clipped estimate is bounded: Y* − Ȳ* ∈ [0, M(1 − W̄*)]. In practice R was set to the 5th-largest observed weight.
  - The **outer CI** (CLT or empirical Bernstein) reflects sample size.
  - The **inner CI** Ȳ* ≤ Y* ≤ Ȳ* + M(1 − Ŵ* + ξ_R) reflects insufficient exploration.
  - A large inner interval means you should change data collection; a large outer interval means you should collect more of the same data. — [ar5iv 1209.2355](https://ar5iv.labs.arxiv.org/html/1209.2355)
- **Replay method** (Li, Chu, Langford, Wang, WSDM 2011): keep logged events where the evaluated policy's choice matches the logged choice. It is provably unbiased when logging is uniformly random, and was validated against online bucket tests on Yahoo! Front Page data. — [arXiv 1003.5956](https://arxiv.org/pdf/1003.5956)
- **Doubly robust** off-policy evaluation (Dudík, Langford, Li, ICML 2011) combines a reward model with importance weighting. It had lower variance and better policies across extensive comparisons, and was extended to sequential RL by Jiang & Li (2016), unbiased with lower variance than IS. — [arXiv 1103.4601](https://www.arxiv.org/abs/1103.4601); [Jiang & Li, ar5iv 1511.03722](https://ar5iv.arxiv.org/html/1511.03722)
- **High-confidence off-policy evaluation** (Thomas, Theocharous, Ghavamzadeh, AAAI 2015) gives a lower confidence bound on a new policy's return from logged data, which is a natural form for a promotion gate. — [AAAI 2015](https://ojs.aaai.org/index.php/AAAI/article/view/9541)

### Inferences
- **Level 1: exact one-step regret audit (practical now).** For each of our logged auctions, compute m (paid if we won, topBid if we lost). For any candidate bid rule, evaluate whether it would have won and at what price, holding the rest of our trajectory fixed only for that auction's *immediate* economics. Useful outputs include:
  - "missed tiles we valued above m";
  - "tiles bought above our own later realized marginal value";
  - money left unspent at the end (ending balance 21 against leaders' 8–53).

  This is unbiased for the immediate outcome but not for downstream score.
- **Level 2: hybrid replay (practical; moderate bias).** Replay logged matches until the first auction where the candidate's decision differs from the logged one. From that point, continue in the simulator, seeded with:
  - the logged letter sequence (if the bag order is exogenous to who wins — likely, but unverified);
  - rivals' known purchases so far;
  - rival models for the rest.

  This uses real data for the shared prefix and the calibrated sim only for the divergent suffix. The bias comes only from rival-model error after divergence. Diverging later gives more realism.
- **Level 3: Bottou-style randomized live bids (practical, cheap).** In live play, multiply our bid in each auction by a log-normal factor with mean 1 and σ ≈ 0.1–0.2. That is smaller than Bottou's 0.3, to limit cost; the value is a judgment call. Log the factor.

  Then any policy whose bids fall within the support can be evaluated by importance weighting over per-auction propensities. Per-match weights are products over ~68 auctions and will explode, so:
  - use per-decision importance sampling or doubly robust estimators with the hybrid-replay sim as the reward model;
  - clip as in Bottou;
  - report inner and outer CIs.

  Restrict the evaluated policies to small parameter perturbations, e.g., gradient estimation on 9 parameters — the "counterfactual derivatives" idea.
- **Rival reaction caveat.** If rivals bid based on *our* rack or balance (as our own `opponentWeight` parameter does), our counterfactual actions change their bids even within the same match. Pure replay cannot capture this. Bottou's equilibrium section addresses small displacements only; its details were not retrieved.
- **Promotion rule from OPE.** Use a high-confidence lower bound (Thomas et al.) on Level-2/3 estimated PL score gain, then confirm with a short live SPRT (Section 6). OPE screens candidates; it does not replace a live test.

### Gaps
- Bottou et al.'s Section 7 equilibrium assumptions (how advertisers' bids are modeled to respond) were beyond the fetched portion.
- Whether the server's tile sequence (bag order) is fixed per match regardless of auction outcomes was not verified. It is required for Level-2 replay validity.
- No source found that applies OPE to *sequential multi-unit auctions with budgets*; the levels above are inferences combining the cited techniques.
