import { readFileSync } from 'node:fs';
import { rackFrom, rackString, wordScore, type Rack } from './letters.js';

export interface Word {
  text: string;
  counts: Rack;
  score: number;
  slots: number[];
}
interface Node { children: Map<number, Node>; word?: Word }
export interface Candidate { word: Word; missing: number[] }

export class Dictionary {
  readonly root: Node = { children: new Map() };
  readonly words: Word[] = [];
  private exactCache = new Map<string, Word[]>();

  constructor(source: string[]) {
    // Anagrams have identical strategic value. Keep one spelling per multiset.
    const signatures = new Set<string>();
    for (const raw of source) {
      const text = raw.trim().toUpperCase();
      if (!/^[A-Z]{2,}$/.test(text)) continue;
      const counts = rackFrom(text);
      const signature = rackString(counts);
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      const word = { text, counts, score: wordScore(text), slots: [...text].map(c => c.charCodeAt(0) - 65) };
      this.words.push(word);
      let node = this.root;
      for (const slot of word.slots) {
        if (!node.children.has(slot)) node.children.set(slot, { children: new Map() });
        node = node.children.get(slot)!;
      }
      node.word = word;
    }
  }

  playable(rack: Rack): Word[] {
    const key = rackString(rack);
    const cached = this.exactCache.get(key);
    if (cached) return cached;
    const result = this.candidates(rack, 0).map(c => c.word)
      .sort((a, b) => b.score - a.score || b.text.length - a.text.length || a.text.localeCompare(b.text));
    if (this.exactCache.size >= 800) this.exactCache.delete(this.exactCache.keys().next().value!);
    this.exactCache.set(key, result);
    return result;
  }

  candidates(rack: Rack, missingLimit: number): Candidate[] {
    const available = rack.slice();
    const result: Candidate[] = [];
    const missing: number[] = [];
    const visit = (node: Node) => {
      if (node.word) result.push({ word: node.word, missing: [...missing] });
      for (const [slot, child] of node.children) {
        if (available[slot]) {
          available[slot]--;
          visit(child);
          available[slot]++;
        } else if (missing.length < missingLimit) {
          missing.push(slot);
          visit(child);
          missing.pop();
        }
      }
    };
    visit(this.root);
    return result;
  }
}

export function loadDictionary(): Dictionary {
  return new Dictionary(readFileSync(new URL('../data/enable.txt', import.meta.url), 'utf8').split('\n'));
}
