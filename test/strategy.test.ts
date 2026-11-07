import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Dictionary } from '../src/dictionary.js';
import { fits, rackFrom, subtract, wordScore } from '../src/letters.js';
import { Planner } from '../src/planner.js';
import { Strategy, type GameContext } from '../src/strategy.js';

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
test('bids never exceed balance in either auction format', () => {
  const strategy = new Strategy(new Dictionary(['QUIZ', 'QI']));
  for (const balance of [0, 1, 5, 10, 100]) for (const auctionType of ['Vickrey', 'FirstPrice'] as const) {
    const amount = strategy.bid('Z', context('QUI', { balance, auctionType })).amount;
    assert(Number.isInteger(amount) && amount >= 0 && amount <= balance);
  }
});
test('small racks still invest in common tiles before a word is complete', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT']));
  assert(strategy.bid('E', context('C')).amount >= 3);
});
test('empty racks do not penalize consonants as if vowels were missing', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT']));
  assert.equal(strategy.bid('T', context('')).amount, strategy.bid('E', context('')).amount);
});
test('a seven-letter completion can be funded while protecting later rounds', () => {
  const strategy = new Strategy(new Dictionary(['ORIENT', 'ORIENTS']));
  assert(strategy.bid('S', context('ORIENT', { balance: 30, remaining: 40, totalAuctions: 68 })).amount > 2);
});
test('six-letter words wait for the full bonus while funds and time permit', () => {
  const strategy = new Strategy(new Dictionary(['ORIENT', 'ORIENTS']));
  assert.equal(strategy.word(context('ORIENT', { balance: 60, remaining: 35 })).word, null);
  assert.equal(strategy.word(context('ORIENTS', { balance: 60, remaining: 30 })).word, 'ORIENTS');
});
test('a big completion outbids unrelated letters', () => {
  const strategy = new Strategy(new Dictionary(['QUIZ', 'QI', 'IT', 'TIZ']));
  assert(strategy.bid('Z', context('QUI')).amount > strategy.bid('B', context('QUI')).amount);
});
test('short words wait for a seven even when funds are low, unless broke', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT', 'CATER', 'CART']));
  assert.equal(strategy.word(context('CAT')).word, null);
  assert.equal(strategy.word(context('CAT', { balance: 10 })).word, null);
  assert.equal(strategy.word(context('CAT', { balance: 2 })).word, 'CAT');
});
test('last 16 auctions liquidate short words', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT']));
  assert.equal(strategy.word(context('CAT', { remaining: 16 })).word, 'CAT');
});
test('rare letters and full racks get no speculative bid', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT']));
  assert.equal(strategy.bid('J', context('CAT')).amount, 0);
  assert.equal(strategy.bid('E', context('CATBDFGHKM')).amount, 0);
});
test('builder ceilings rise with active bidders', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT']));
  assert(strategy.bid('S', context('CAT', { activePlayers: 6 })).amount > strategy.bid('S', context('CAT', { activePlayers: 3 })).amount);
});
test('endgame spends on tiles that pay before the end and ignores the rest', () => {
  const strategy = new Strategy(new Dictionary(['ET']));
  assert.equal(strategy.bid('T', context('E', { remaining: 3, balance: 40 })).amount, 40);
  assert.equal(strategy.bid('J', context('E', { remaining: 10, balance: 40 })).amount, 0);
});
test('late builder ceilings rise and small racks spend spare cash late', () => {
  const strategy = new Strategy(new Dictionary(['CAT', 'AT']));
  assert(strategy.bid('S', context('CAT', { remaining: 20 })).amount > strategy.bid('S', context('CAT', { remaining: 50 })).amount);
  assert.equal(strategy.bid('S', context('CA', { remaining: 10, balance: 40 })).amount, 8);
  assert.equal(strategy.bid('S', context('CA', { remaining: 10, balance: 7 })).amount, 2);
  assert.equal(strategy.bid('J', context('CA', { remaining: 10, balance: 40 })).amount, 0);
});
test('higher-value letters get higher builder ceilings; cheap sevens wait early, rich ones go', () => {
  const strategy = new Strategy(new Dictionary(['ORIENTS', 'OXYGENS', 'AT']));
  assert(strategy.bid('H', context('CAT')).amount > strategy.bid('U', context('CAT')).amount);
  assert.equal(strategy.word(context('ORIENTS', { remaining: 50 })).word, null);
  assert.equal(strategy.word(context('ORIENTS', { remaining: 20 })).word, 'ORIENTS');
  assert.equal(strategy.word(context('OXYGENS', { remaining: 50 })).word, 'OXYGENS');
  assert.equal(strategy.word(context('ORIENTS', { remaining: 50, balance: 5 })).word, 'ORIENTS');
});
test('builder bids toward a rich 7-letter target more than toward a cheap one', () => {
  // N completes OXYGEN-S toward a 54-point word; T completes ORIEN-S toward a 21-point word.
  const strategy = new Strategy(new Dictionary(['OXYGENS', 'ORIENTS', 'AT']));
  const rich = strategy.bid('N', context('OXYGE', { remaining: 45 }));
  const cheap = strategy.bid('T', context('ORIEN', { remaining: 45 }));
  assert(rich.reason.includes('OXYGENS'), rich.reason);
  assert(rich.amount > cheap.amount, `${rich.amount} vs ${cheap.amount}`);
});
test('target bidding never bids below the letter ceiling logic and never exceeds balance', () => {
  const strategy = new Strategy(new Dictionary(['OXYGENS', 'AT']));
  assert(strategy.bid('S', context('CAT', { remaining: 45 })).amount > 0);
  assert(strategy.bid('N', context('OXYGE', { remaining: 45, balance: 3 })).amount <= 3);
});
test('never holds a word while bidding is switched off (fit-v7 freeze)', () => {
  const strategy = new Strategy(new Dictionary(['ORIENTS', 'AT']));
  // 7 letters worth 21 points, early game: held with room to bid, played once the rack reaches the builder limit.
  assert.equal(strategy.word(context('ORIENTS', { remaining: 50 })).word, null);
  assert.equal(strategy.word(context('ORIENTSBDF', { remaining: 50 })).word, 'ORIENTS');
  // any rack the bot holds a word on must still produce builder bids
  assert(strategy.bid('S', context('ORIENTS', { remaining: 50 })).amount > 0);
});
test('heavy letters get ceilings near their market price; J/Q/X/Z only bid for a real target', () => {
  const strategy = new Strategy(new Dictionary(['OXYGENS', 'AT']));
  const c = context('CAT', { remaining: 45, activePlayers: 4.5 });
  assert(strategy.ceiling('K', c) >= 20 && strategy.ceiling('H', c) >= 18 && strategy.ceiling('U', c) < 14);
  assert.equal(strategy.ceiling('X', c), 0);
  assert.equal(strategy.bid('X', context('CAT', { remaining: 45 })).amount, 0);
  assert(strategy.bid('X', context('OGENS', { remaining: 45 })).amount > 0);
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
