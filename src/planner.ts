import { type Dictionary, type Word } from './dictionary.js';
import { faceValue, fits, rackString, subtract, tileCount, type Rack } from './letters.js';

export interface Plan { score: number; words: Word[]; used: number; bounded: boolean }
const EMPTY: Plan = { score: 0, words: [], used: 0, bounded: false };

export class Planner {
  private cache = new Map<string, Plan>();
  constructor(readonly dictionary: Dictionary, readonly maxStates = 1000, readonly strictBudget = false) {}

  plan(rack: Rack): Plan {
    const key = rackString(rack);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const all = this.dictionary.playable(rack);
    if (!all.length) return EMPTY;
    // Bound pathological large racks. Include high scoring plays and short
    // cleanup words, which can beat one longer word when combined.
    const limited = all.length > 180;
    const candidates = limited ? [...new Set([...all.slice(0, 140), ...all.filter(w => w.text.length <= 3).slice(0, 40)])] : all;
    const memo = new Map<string, Plan>();
    let states = 0;
    const greedy = (remaining: Rack): Plan => {
      let score = 0, used = 0;
      const words: Word[] = [];
      for (const w of candidates) {
        while (fits(w.counts, remaining)) {
          remaining = subtract(remaining, w.counts);
          words.push(w); score += w.score; used += w.text.length;
        }
      }
      return { score, words, used, bounded: true };
    };
    const solve = (remaining: Rack): Plan => {
      if (tileCount(remaining) < 2) return EMPTY;
      const state = rackString(remaining);
      const known = memo.get(state);
      if (known) return known;
      if (++states > this.maxStates) return greedy(remaining);
      let best: Plan = { ...EMPTY, bounded: limited };
      const ceiling = faceValue(remaining) * 3;
      for (const word of candidates) {
        if (!fits(word.counts, remaining)) continue;
        const rest = solve(subtract(remaining, word.counts));
        const score = word.score + rest.score;
        const used = word.text.length + rest.used;
        if (score > best.score || (score === best.score && used > best.used)) {
          best = { score, used, words: [word, ...rest.words], bounded: limited || rest.bounded };
        }
        // Stop the whole search once its shared state budget is exhausted.
        // Merely falling back inside recursive calls still explores every
        // remaining branch and can take seconds on a large rack.
        if (this.strictBudget && states >= this.maxStates) { best.bounded = true; break; }
        if (best.score === ceiling) break;
      }
      memo.set(state, best);
      return best;
    };
    const result = solve(rack);
    if (this.cache.size >= 800) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, result);
    return result;
  }
}
