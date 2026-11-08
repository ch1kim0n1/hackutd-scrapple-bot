import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Dictionary } from '../src/dictionary.js';
import { fits, rackFrom, subtract, wordScore } from '../src/letters.js';
import { Planner } from '../src/planner.js';
import { simulatedBid } from '../src/opponents.js';
import { Strategy, V5_POLICY, DEFAULT_POLICY, type GameContext } from '../src/strategy.js';

const context = (letters: string, extra: Partial<GameContext> = {}): GameContext => ({ rack: rackFrom(letters), balance: 100, remaining: 50, players: 6, auctionType: 'Vickrey', ...extra });

test('word rewards match the integer server scoring', () => {
  assert.equal(wordScore('AX'), 9);
  assert.equal(wordScore('BATH'), 13);
  assert.equal(wordScore('QUIZ'), 33);
  assert.equal(wordScore('COAXING'), 51);
});
test('trie respects repeated letters, anagrams, and missing copies', () => {
  const dictionary = new Dictionary(['CAT', 'ACT', 'TACT', 'AT', 'TAT']);
  assert.deepEqual(dictionary.playable(rackFrom('CAT')).map(w => w.text), ['CAT', 'AT']);
  const candidate = dictionary.candidates(rackFrom('CA'), 2).find(c => c.word.text === 'TACT');
  assert.deepEqual(candidate?.missing, [19, 19]);
  assert(!dictionary.playable(rackFrom('CAT')).some(w => w.text === 'TACT'));
});
test('planner prefers a better combination over the longest word', () => {
  const planner = new Planner(new Dictionary(['BATH', 'AX', 'BY']));
  const plan = planner.plan(rackFrom('BATHXY'));
  assert.equal(plan.score, 16);
  assert.deepEqual(plan.words.map(w => w.text).sort(), ['AX', 'BY']);
});
test('planner can reuse a word only with enough copies of its tiles', () => {
  const planner = new Planner(new Dictionary(['AT', 'TAT']));
  const plan = planner.plan(rackFrom('ATAT'));
  assert.equal(plan.score, 4);
  assert.equal(plan.words.length, 2);
});
test('bounded planner still returns a feasible sequence', () => {
  const planner = new Planner(new Dictionary(['BATH', 'AX', 'BY', 'AT', 'BAT', 'HAT']), 1, true);
  let rack = rackFrom('BATHXYBATHXY');
  const plan = planner.plan(rack);
  let score = 0;
  for (const word of plan.words) {
    assert(fits(word.counts, rack)); rack = subtract(rack, word.counts); score += word.score;
  }
  assert.equal(score, plan.score);
  assert(plan.bounded);
});
test('last auction gets no bid and endgame words are cashed out', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT']));
  assert.equal(strategy.bid('T', context('CA', { remaining: 0 })).amount, 0);
  assert.equal(strategy.word(context('CAT', { remaining: 1 })).word, 'CAT');
});
test('completed valuable words justify more than unrelated letters', () => {
  const strategy = new Strategy(new Dictionary(['QUIZ', 'QI', 'IT', 'TIZ']));
  assert(strategy.bid('Z', context('QUI')).amount > strategy.bid('B', context('QUI')).amount);
});
test('bids never exceed balance in either auction format', () => {
  const strategy = new Strategy(new Dictionary(['QUIZ', 'QI']));
  for (const balance of [0, 1, 5, 10, 100]) for (const auctionType of ['Vickrey', 'FirstPrice'] as const) {
    const amount = strategy.bid('Z', context('QUI', { balance, auctionType })).amount;
    assert(Number.isInteger(amount) && amount >= 0 && amount <= balance);
  }
});
test('short words can wait for a length bonus, but low funds force a sale', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT', 'CATER', 'CART']));
  assert.equal(strategy.word(context('CAT')).word, null);
  assert.equal(strategy.word(context('CAT', { balance: 10 })).word, 'CAT');
});
test('small racks still invest in common tiles before a word is complete', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT']));
  assert(strategy.bid('E', context('C')).amount >= 3);
});
test('empty racks do not penalize consonants as if vowels were missing', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT']));
  assert.equal(strategy.bid('T', context('')).amount, strategy.bid('E', context('')).amount);
});
test('endgame budget mode spends otherwise stranded funds on a playable completion', () => {
  const dictionary = new Dictionary(['CAT', 'ED']);
  const old = new Strategy(dictionary, { endgameBudget: 0, sustainability: 0 }), learned = new Strategy(dictionary, { endgameBudget: 1, sustainability: 0 });
  assert(learned.bid('D', context('CATE', { remaining: 5, balance: 115 })).amount > old.bid('D', context('CATE', { remaining: 5, balance: 115 })).amount);
});
test('v5 midgame reserve prevents a low-value short completion spending the bankroll', () => {
  const strategy = new Strategy(new Dictionary(['ET']), V5_POLICY);
  const ctx = context('E', { balance: 30, remaining: 40, totalAuctions: 68 });
  assert(strategy.bid('T', ctx).amount <= 2);
});
test('a seven-letter completion can be funded while protecting later rounds', () => {
  const strategy = new Strategy(new Dictionary(['ORIENT', 'ORIENTS']));
  assert(strategy.bid('S', context('ORIENT', { balance: 30, remaining: 40, totalAuctions: 68 })).amount > 2);
});
test('six-letter words wait for the full bonus while funds and time permit', () => {
  const strategy = new Strategy(new Dictionary(['ORIENT', 'ORIENTS']));
  assert.equal(strategy.word(context('ORIENT', { balance: 60, remaining: 35 })).word, null);
  assert.equal(strategy.word(context('ORIENTS', { balance: 60, remaining: 35 })).word, null);
  assert.equal(strategy.word(context('ORIENTS', { balance: 60, remaining: 20 })).word, 'ORIENTS');
});
test('v8 keeps the midgame reserve but releases it for the final auctions', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT'])), v5 = new Strategy(new Dictionary(['CAT', 'AT']), V5_POLICY);
  assert.equal(strategy.capitalReserve(context('CA', { remaining: 40, totalAuctions: 68 })), v5.capitalReserve(context('CA', { remaining: 40, totalAuctions: 68 })));
  assert(strategy.capitalReserve(context('CA', { remaining: 8, totalAuctions: 68 })) < v5.capitalReserve(context('CA', { remaining: 8, totalAuctions: 68 })));
});
test('v9 banks a seven-letter word until the final buying window unless funds run low', () => {
  const dictionary = new Dictionary(['GAWKIER']);
  const v5 = new Strategy(dictionary, V5_POLICY), v9 = new Strategy(dictionary);
  assert.equal(v5.word(context('GAWKIER', { remaining: 40, balance: 80 })).word, 'GAWKIER');
  assert.equal(v9.word(context('GAWKIER', { remaining: 40, balance: 80 })).word, null);
  assert.equal(v9.word(context('GAWKIER', { remaining: 20, balance: 80 })).word, 'GAWKIER');
  assert.equal(v9.word(context('GAWKIER', { remaining: 40, balance: 10 })).word, 'GAWKIER');
});
test('v9c banks medium ammunition inside the late transition window', () => {
  const dictionary = new Dictionary(['STOLON']);
  const strategy = new Strategy(dictionary);
  assert.equal(strategy.word(context('STOLON', { remaining: 12, balance: 60 })).word, null);
  assert.equal(strategy.word(context('STOLON', { remaining: 8, balance: 60 })).word, 'STOLON');
});
test('v10 holds fragments long enough to build a real word', () => {
  const dictionary = new Dictionary(['AM', 'EH', 'AHEM', 'AIMER', 'HAREM', 'HERMAI']);
  const v10Policy = { ...DEFAULT_POLICY, upgradeHold: 0, leaveAware: 0, deadEndGuard: 0, premiumPath: 0, midShift: 0, lateFloor: 0, finalWord: 0, portfolio: 0, midQuota: 0, secondReserve: 0, lateTarget: 0, opponentCap: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0 };
  const strategy = new Strategy(dictionary, v10Policy);
  assert.equal(strategy.word(context('AEM', { remaining: 12, balance: 60 })).word, null);
  assert.equal(strategy.word(context('AEHIMR', { remaining: 9, balance: 60 })).word, null);
  assert.equal(strategy.word(context('AEHIMR', { remaining: 8, balance: 60 })).word, 'HERMAI');
});
test('v10 spend-down buys ammo even when it gives a tiny immediate word', () => {
  const strategy = new Strategy(new Dictionary(['IRE', 'AT']), { ...DEFAULT_POLICY, upgradeHold: 0, leaveAware: 0, deadEndGuard: 0, premiumPath: 0, midShift: 0, lateFloor: 0, finalWord: 0, portfolio: 0, midQuota: 0, secondReserve: 0, lateTarget: 0, opponentCap: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0 });
  const bid = strategy.bid('E', context('IR', { remaining: 8, balance: 27, totalAuctions: 68 }));
  assert(bid.reason.startsWith('spend-down'));
  assert.equal(bid.amount, 18);
});
test('v10 buys sparse-rack inventory before the panic window', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT']));
  const bid = strategy.bid('S', context('CA', { remaining: 30, balance: 60, totalAuctions: 68 }));
  assert(bid.amount >= 14);
});
test('v10a preserves a low-cash rack one letter from a strong word', () => {
  const strategy = new Strategy(new Dictionary(['AGED', 'GAINED']));
  const decision = strategy.word(context('ADEGN', { remaining: 19, balance: 9 }));
  assert.equal(decision.word, null);
  assert.match(decision.reason, /hold for I -> GAINED/);
});
test('v10a keeps medium ammo for a concrete upgrade instead of liquidating', () => {
  const strategy = new Strategy(new Dictionary(['UNLAID', 'LANGUID']));
  const decision = strategy.word(context('ADILNU', { remaining: 8, balance: 31 }));
  assert.equal(decision.word, null);
  assert.match(decision.reason, /hold for G -> LANGUID/);
  assert(strategy.bid('G', context('ADILNU', { remaining: 7, balance: 31 })).amount >= 20);
});
test('v11 prefers a slightly smaller word when the leave keeps ammunition', () => {
  const strategy = new Strategy(new Dictionary(['OUTASKED', 'DARKEST', 'NOUN']), { ...DEFAULT_POLICY, midShift: 0, lateFloor: 0, finalWord: 0, portfolio: 0, midQuota: 0, secondReserve: 0, lateTarget: 0, opponentCap: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0 });
  assert.equal(strategy.word(context('ADEKORSTU', { remaining: 8, balance: 43 })).word, 'DARKEST');
});
test('v11 blocks late buys that create a vowel-free dead rack', () => {
  const strategy = new Strategy(new Dictionary(['RUNS', 'GIN']));
  const dead = strategy.bid('S', context('R', { remaining: 6, balance: 25, totalAuctions: 68 }));
  assert(!dead.reason.startsWith('spend-down'));
  assert(dead.amount < 10);
  const live = strategy.bid('I', context('GN', { remaining: 5, balance: 11, totalAuctions: 68 }));
  assert(live.reason.startsWith('spend-down'));
});
test('v11 pays for a premium letter that advances a real word path', () => {
  const strategy = new Strategy(new Dictionary(['ZING']));
  const bid = strategy.bid('Z', context('IN', { remaining: 10, balance: 30, totalAuctions: 68 }));
  assert(bid.amount >= 20);
});
test('v11b shifts speculative buying from early to midgame', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT']));
  const early = strategy.bid('S', context('CA', { remaining: 50, balance: 60, totalAuctions: 68 }));
  const mid = strategy.bid('S', context('CA', { remaining: 30, balance: 60, totalAuctions: 68 }));
  assert(mid.amount > early.amount);
});
test('v11b preserves late liquidity for final ammunition', () => {
  const strategy = new Strategy(new Dictionary(['AT', 'CAT']));
  const bid = strategy.bid('L', context('OU', { remaining: 10, balance: 30, totalAuctions: 68 }));
  assert(bid.reason.startsWith('spend-down'));
  assert(bid.amount <= 14);
});
test('v11b keeps a 20+ word alive until the final liquidation window', () => {
  const strategy = new Strategy(new Dictionary(['FANTOD']));
  const decision = strategy.word(context('ADFNOT', { remaining: 8, balance: 20 }));
  assert.equal(decision.word, null);
  assert.match(decision.reason, /bank FANTOD as final ammunition/);
});
test('v12 funds midgame quota with letters that create progress', () => {
  const strategy = new Strategy(new Dictionary(['IRE']));
  assert(strategy.bid('E', context('IR', { remaining: 30, balance: 60, totalAuctions: 68 })).amount >= 17);
});
test('v12 expands late spend-down to targeted word paths', () => {
  const strategy = new Strategy(new Dictionary(['CART', 'CRATE', 'CRATES']));
  const bid = strategy.bid('E', context('CART', { remaining: 10, balance: 30, totalAuctions: 68 }));
  assert(bid.reason.startsWith('spend-down'));
  assert(bid.amount >= 15);
});
test('v12 sells a funding word while preserving a stronger second word', () => {
  const strategy = new Strategy(new Dictionary(['FANTOD', 'CART']));
  assert.equal(strategy.word(context('AACDFNORTT', { remaining: 10, balance: 30 })).word, 'CART');
});
test('v12 does not pay for extra copies of an already playable word', () => {
  const strategy = new Strategy(new Dictionary(['WEEWEED']));
  assert(strategy.bid('E', context('DEEEESWW', { remaining: 60, balance: 57, totalAuctions: 68 })).amount < 15);
});
test('v12 releases a locked bankroll through a 30+ word', () => {
  const strategy = new Strategy(new Dictionary(['WEEWEED']));
  const decision = strategy.word(context('DEEEESWW', { remaining: 55, balance: 24 }));
  assert.equal(decision.word, 'WEEWEED');
  assert.match(decision.reason, /release bankroll lock/);
});
test('v12 does not overpay for an unfinished premium word path', () => {
  const strategy = new Strategy(new Dictionary(['GIVEAWAY']));
  assert(strategy.bid('V', context('AEGTWY', { remaining: 66, balance: 81, totalAuctions: 68 })).amount < 30);
});
test('v12c preserves last ammunition instead of emptying the rack early', () => {
  const strategy = new Strategy(new Dictionary(['ER']));
  const decision = strategy.word(context('ER', { remaining: 29, balance: 30 }));
  assert.equal(decision.word, null);
  assert.match(decision.reason, /preserve last ammunition/);
});
test('v12c pays for near-complete midgame targets', () => {
  const strategy = new Strategy(new Dictionary(['CART', 'CRATE', 'CRATES']));
  assert(strategy.bid('E', context('CART', { remaining: 30, balance: 45, totalAuctions: 68 })).amount >= 20);
});
test('v12c protects second-path cash on generic late buys', () => {
  const strategy = new Strategy(new Dictionary(['AT']));
  const bid = strategy.bid('A', context('T', { remaining: 12, balance: 40, totalAuctions: 68 }));
  assert(bid.amount <= 12);
  assert.match(bid.reason, /reserve 28/);
});
test('v13 buys LUCENT-style midgame volume', () => {
  const dictionary = new Dictionary(['ART']);
  const v12c = new Strategy(dictionary, { ...DEFAULT_POLICY, lucent: 0 });
  const v13 = new Strategy(dictionary);
  const ctx = context('AT', { remaining: 30, balance: 60, totalAuctions: 68 });
  assert(v13.bid('R', ctx).amount >= 14);
  assert(v13.bid('R', ctx).amount >= v12c.bid('R', ctx).amount);
});
test('v13 recycles a scored word into bidding funds while preserving ammo', () => {
  const strategy = new Strategy(new Dictionary(['MARQUEE', 'ER']), { lucent: 3 });
  const decision = strategy.word(context('AEEMQRRUA', { remaining: 30, balance: 60 }));
  assert.equal(decision.word, 'MARQUEE');
  assert.match(decision.reason, /cash recycling/);
});
test('v13d uses LUCENT priors for first-path volume', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT']), { lucent: 4 });
  const bid = strategy.bid('D', context('CA', { remaining: 50, balance: 100, totalAuctions: 68 }));
  assert(bid.amount >= 14);
});
test('v13d plays seven-letter words once rack reaches LUCENT floor', () => {
  const strategy = new Strategy(new Dictionary(['MARQUEE', 'ER']), { lucent: 4 });
  const decision = strategy.word(context('AEEMQRRUA', { remaining: 30, balance: 60 }));
  assert.equal(decision.word, 'MARQUEE');
  assert.match(decision.reason, /LUCENT rack recycle/);
});
test('v13e bids LUCENT-paced volume on broad letters', () => {
  const strategy = new Strategy(new Dictionary(['AT']), { lucent: 5 });
  const bid = strategy.bid('N', context('AT', { remaining: 50, balance: 70, totalAuctions: 68 }));
  assert(bid.amount >= 10);
});
test('v13f uses LUCENT winning-bid p75 for volume', () => {
  const strategy = new Strategy(new Dictionary(['AT']), { lucent: 6 });
  const bid = strategy.bid('N', context('AT', { remaining: 50, balance: 70, totalAuctions: 68 }));
  assert(bid.amount >= 15);
});
test('v14 pays a targeted late premium completion', () => {
  const strategy = new Strategy(new Dictionary(['JAB', 'AT']), { lucent: 0, winner: 1 });
  const bid = strategy.bid('J', context('AB', { remaining: 12, balance: 40, totalAuctions: 68 }));
  assert(bid.amount >= 20);
});
test('v14 cashes medium words to fund late purchases', () => {
  const strategy = new Strategy(new Dictionary(['MARCH', 'AR']), { lucent: 0, winner: 3 });
  const decision = strategy.word(context('MARCH', { remaining: 15, balance: 40 }));
  assert.equal(decision.word, 'MARCH');
});
test('v14g buys winner-style useful late letters', () => {
  const strategy = new Strategy(new Dictionary(['AT', 'ANT']), { lucent: 0, winner: 4 });
  const bid = strategy.bid('N', context('AT', { remaining: 12, balance: 40, totalAuctions: 68 }));
  assert(bid.amount >= 14);
});
test('v15 catches up to winner late-buy quota on useful letters', () => {
  const strategy = new Strategy(new Dictionary(['AT', 'ANT']), { lucent: 1, winner: 6 });
  const bid = strategy.bid('N', context('AT', { remaining: 12, balance: 40, totalAuctions: 68, lateBought: 0 }));
  assert(bid.amount >= 14);
});
test('v8 spend-down uses market-paced bids on every liquid late letter', () => {
  const dictionary = new Dictionary(['CAT', 'AT']);
  const v8Policy = { ...DEFAULT_POLICY, wordBank: 0, targetStrike: 0, inventoryBuild: 0, fragmentHoldUntil: 12, lateSpendGainCap: 0, upgradeHold: 0, leaveAware: 0, deadEndGuard: 0, premiumPath: 0, midShift: 0, lateFloor: 0, finalWord: 0, portfolio: 0, midQuota: 0, secondReserve: 0, lateTarget: 0, opponentCap: 0, ammoReserve: 0, targetedMid: 0, latePressure: 0, lucent: 0 };
  const v5 = new Strategy(dictionary, V5_POLICY), v8 = new Strategy(dictionary, v8Policy);
  const ctx = context('BK', { remaining: 10, balance: 40, totalAuctions: 68 });
  assert.equal(v8.bid('S', ctx).amount, 20);
  assert(v8.bid('S', ctx).reason.startsWith('spend-down'));
  assert.equal(v8.bid('U', ctx).amount, 16);
  assert.equal(v8.bid('S', context('BK', { remaining: 16, balance: 40, totalAuctions: 68 })).amount, 19);
  assert.equal(v8.bid('U', context('BK', { remaining: 4, balance: 40, totalAuctions: 68 })).amount, 21);
  const hotOpponents = [{ botId: 1, balance: 36, rackSize: 12, score: 146 }, { botId: 2, balance: 23, rackSize: 10, score: 0 }];
  assert.equal(v8.bid('S', context('BK', { remaining: 10, balance: 40, totalAuctions: 68, opponents: hotOpponents })).amount, 25);
  assert.equal(v8.bid('U', context('BK', { remaining: 10, balance: 40, totalAuctions: 68, opponents: hotOpponents })).amount, 21);
  assert(v5.bid('S', ctx).amount < 8);
  assert(!v8.bid('J', ctx).reason.startsWith('spend-down'));
  assert(v8.bid('S', context('BK', { remaining: 10, balance: 7 })).amount >= 7);
  assert(!v8.bid('S', context('BK', { remaining: 1, balance: 40 })).reason.startsWith('spend-down'));
  assert(v8.bid('U', context('', { remaining: 4, balance: 43 })).amount >= 20);
  const duplicate = v8.bid('S', context('BS', { remaining: 10, balance: 40, totalAuctions: 68 }));
  assert(!duplicate.reason.startsWith('spend-down') && duplicate.amount < 19);
  const stocked = v8.bid('S', context('CATALOG', { remaining: 10, balance: 40, totalAuctions: 68 }));
  assert(!stocked.reason.startsWith('spend-down') && stocked.amount < 19);
  assert(v8.bid('S', context('', { remaining: 10, balance: 40, totalAuctions: 68 })).amount >= 18);
});
test('simulated bid model matches source jitter and balance bounds', () => {
  assert.equal(simulatedBid('Human', 'Z', 100, 2), 0);
  assert.equal(simulatedBid('Cheapskate', 'A', 100, -2), 1);
  assert.equal(simulatedBid('ValueBidder', 'A', 100, 2), 3);
  assert.equal(simulatedBid('Aggressive', 'A', 100, 2), 7);
  assert.equal(simulatedBid('Aggressive', 'Z', 100, 2), 14);
  assert.equal(simulatedBid('Aggressive', 'Z', 3, 2), 3);
  assert.equal(simulatedBid('Aggressive', 'Z', 0, 2), 0);
});
test('known simulated tables never overpay for a guaranteed win', () => {
  const strategy = new Strategy(new Dictionary(['QUIZ']));
  const opponents = Array.from({ length: 5 }, (_, i) => ({ botId: i + 1, balance: 100, rackSize: 5, simulatedStrategy: 'Aggressive' as const }));
  for (const auctionType of ['Vickrey', 'FirstPrice'] as const) {
    const ctx = context('QUI', { auctionType, remaining: 40, opponents });
    assert.equal(strategy.bid('Z', ctx).amount, 15);
  }
});
test('an unknown rival prevents the simulated-bid guarantee cap', () => {
  const strategy = new Strategy(new Dictionary(['QUIZ']));
  const opponents = Array.from({ length: 5 }, (_, i) => ({ botId: i + 1, balance: 100, rackSize: 5, simulatedStrategy: i ? 'Aggressive' as const : undefined }));
  assert(strategy.bid('Z', context('QUI', { remaining: 40, opponents })).amount > 15);
});
test('small-rack planner matches an independent exhaustive allocation oracle', () => {
  const words = ['AT', 'BAT', 'TAB', 'BATH', 'HAT', 'AB', 'AH', 'TA'];
  const dictionary = new Dictionary(words);
  const planner = new Planner(dictionary, 10_000);
  const oracle = (letters: string): number => {
    let best = 0;
    for (const word of words) {
      let remaining = letters;
      let valid = true;
      for (const c of word) {
        const index = remaining.indexOf(c);
        if (index < 0) { valid = false; break; }
        remaining = remaining.slice(0, index) + remaining.slice(index + 1);
      }
      if (valid) best = Math.max(best, wordScore(word) + oracle(remaining));
    }
    return best;
  };
  for (const letters of ['ABT', 'AABBTT', 'AABHTT', 'ABHHTT', 'AAABTT', 'BATHBATH']) {
    assert.equal(planner.plan(rackFrom(letters)).score, oracle(letters), letters);
  }
});
