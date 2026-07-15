import { Rng } from "./gameEngine";

/** Deterministic PRNG (mulberry32) — the same numeric seed always produces the same sequence. */
export function mulberry32(seed: number): Rng {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/** Today's date as YYYY-MM-DD in UTC, so everyone gets the same daily challenge regardless of local timezone. */
export function todayUtcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** A seeded RNG derived from a date string (defaults to today, UTC) — same date always produces the same reveal order. */
export function dailyRng(dateString: string = todayUtcDateString()): Rng {
  return mulberry32(hashString(dateString));
}
