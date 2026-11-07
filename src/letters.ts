export const VALUES = [1,3,3,2,1,4,2,4,1,8,5,1,3,1,1,3,10,1,1,1,1,4,4,8,4,10];
export const BAG = [9,2,2,4,12,2,3,2,9,1,1,4,2,6,8,2,1,6,4,6,4,2,2,1,2,1];
export type Rack = Uint8Array;

export function rackFrom(letters: string): Rack {
  const rack = new Uint8Array(26);
  for (const c of letters.toUpperCase()) {
    const i = c.charCodeAt(0) - 65;
    if (i >= 0 && i < 26) rack[i]++;
  }
  return rack;
}
export function rackString(rack: ArrayLike<number>): string {
  let result = '';
  for (let i = 0; i < 26; i++) result += String.fromCharCode(i + 65).repeat(rack[i]);
  return result;
}
export function tileCount(rack: ArrayLike<number>): number {
  return Array.from(rack).reduce((a, b) => a + b, 0);
}
export function faceValue(rack: ArrayLike<number>): number {
  return Array.from(rack).reduce((a, n, i) => a + n * VALUES[i], 0);
}
export function wordScore(word: string): number {
  const base = [...word].reduce((n, c) => n + VALUES[c.charCodeAt(0) - 65], 0);
  const multiplier = word.length <= 3 ? 1 : word.length === 4 ? 1.5 : word.length === 5 ? 2 : word.length === 6 ? 2.5 : 3;
  return Math.floor(base * multiplier);
}
export function fits(need: ArrayLike<number>, rack: ArrayLike<number>): boolean {
  for (let i = 0; i < 26; i++) if (need[i] > rack[i]) return false;
  return true;
}
export function subtract(rack: Rack, need: Rack): Rack {
  const result = rack.slice();
  for (let i = 0; i < 26; i++) result[i] -= need[i];
  return result;
}
