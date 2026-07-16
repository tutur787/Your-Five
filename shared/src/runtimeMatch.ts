import { seededRng } from "./dailySeed";
import { createMatchFromPool } from "./gameEngine";
import type { MatchState } from "./types";
import type { SportRuntime } from "./runtimeTypes";

function randomIdentifier(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createMatchWithRuntime(
  runtime: SportRuntime,
  poolSeed = randomIdentifier(),
  matchId = randomIdentifier()
): MatchState {
  return createMatchFromPool(runtime.sport, runtime.buildPool(seededRng(poolSeed)), {
    matchId,
    poolSeed,
    poolVersion: runtime.poolVersion,
  });
}
