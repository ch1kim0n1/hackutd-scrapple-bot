import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Dictionary } from '../src/dictionary.js';
import { fits, rackFrom, subtract, wordScore } from '../src/letters.js';
import { Planner } from '../src/planner.js';
import { Strategy, V5_POLICY, type GameContext } from '../src/strategy.js';

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
  const dictionary = new Dictionary(['ET']);
  const old = new Strategy(dictionary, { endgameBudget: 0, sustainability: 0 }), learned = new Strategy(dictionary, { endgameBudget: 1, sustainability: 0 });
  assert(learned.bid('T', context('E', { remaining: 5, balance: 115 })).amount > old.bid('T', context('E', { remaining: 5, balance: 115 })).amount);
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
  assert.equal(strategy.word(context('ORIENTS', { balance: 60, remaining: 35 })).word, 'ORIENTS');
});
test('v6 lowers the reserve so it can bid where v5 was capped', () => {
  const dictionary = new Dictionary(['CAT', 'AT', 'CATER', 'CART', 'RATE', 'TEAR']);
  const v5 = new Strategy(dictionary, V5_POLICY), v6 = new Strategy(dictionary);
  assert(v6.capitalReserve(context('CA', { remaining: 40, totalAuctions: 68 })) < v5.capitalReserve(context('CA', { remaining: 40, totalAuctions: 68 })));
  let higher = 0, lower = 0;
  for (const letter of 'ERSTNLD') for (const rack of ['CA', 'CAT', 'CAR', 'RATE']) for (const balance of [30, 45, 60]) {
    const ctx = context(rack, { balance, remaining: 40, totalAuctions: 68 });
    const a = v6.bid(letter, ctx).amount, b = v5.bid(letter, ctx).amount;
    if (a > b) higher++; if (a < b) lower++;
  }
  assert(higher > 0 && lower === 0, `higher ${higher} lower ${lower}`);
});
test('spend-down buys common letters late with spare cash, and only in v6', () => {
  const dictionary = new Dictionary(['CAT', 'AT']);
  const v5 = new Strategy(dictionary, V5_POLICY), v6 = new Strategy(dictionary);
  const ctx = context('BK', { remaining: 10, balance: 40, totalAuctions: 68 });
  assert.equal(v6.bid('S', ctx).amount, 8);
  assert(v6.bid('S', ctx).reason.startsWith('spend-down'));
  assert(v5.bid('S', ctx).amount < 8);
  assert(!v6.bid('J', ctx).reason.startsWith('spend-down'));
  assert.equal(v6.bid('S', context('BK', { remaining: 10, balance: 7 })).amount <= 2, true);
  assert.equal(v6.bid('S', context('BK', { remaining: 2, balance: 40 })).amount < 8, true);
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
