import { createSeededMatch, validSlotsFor, type MatchState, type Sport } from "@fiveaside/shared";
import { recordCompletedMatch } from "./progressRecorder";
import { loadProgress, progressRecordFor, PROGRESS_KEY } from "./progressStorage";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

let failures = 0;
function assert(condition: unknown, message: string): void {
  if (condition) console.log(`ok: ${message}`);
  else {
    failures++;
    console.error(`FAIL: ${message}`);
  }
}

function completedMatch(sport: Sport, matchId: string, winner: "A" | "B" | "tie" = "A"): MatchState {
  const state = createSeededMatch(sport, `pool-${matchId}`, matchId);
  const player = state.pool[0];
  state.pool = state.pool.slice(1);
  state.teams.A.roster = [{ player, price: 1, slot: validSlotsFor(player)[0] }];
  state.phase = "complete";
  state.winner = winner;
  state.completionReason = "score";
  return state;
}

{
  const storage = new MemoryStorage();
  const win = completedMatch("basketball", "quick-win", "A");
  recordCompletedMatch(win, "ai-competitive", "A", { storage });
  recordCompletedMatch(win, "ai-competitive", "A", { storage });
  let progress = loadProgress(storage);
  assert(progress.sports.basketball.overall.wins === 1, "a completed match is recorded exactly once");
  assert(progress.sports.basketball.currentWinStreak === 1, "a win starts the sport win streak");
  assert(progress.recent.length === 1, "duplicate completion effects do not duplicate history");
  assert(progress.achievements.some((achievement) => achievement.id === "first-five"), "the first completed draft unlocks its milestone");
  assert(progress.achievements.some((achievement) => achievement.id === "cap-manager"), "match-specific budget achievements are evaluated");

  recordCompletedMatch(completedMatch("basketball", "daily-tie", "tie"), "daily", "A", { storage });
  progress = loadProgress(storage);
  assert(progress.sports.basketball.overall.ties === 1, "daily games contribute to the all-time record");
  assert(progress.sports.basketball.currentWinStreak === 0, "a tie resets the win streak");

  const beforeNeutral = { ...progress.sports.soccer.overall };
  recordCompletedMatch(completedMatch("soccer", "couch-game", "A"), "local", null, { storage });
  progress = loadProgress(storage);
  assert(
    JSON.stringify(progress.sports.soccer.overall) === JSON.stringify(beforeNeutral) && progress.recent[0].result === "neutral",
    "couch drafts enter history without changing a personal record"
  );

  for (let index = 0; index < 12; index++) {
    recordCompletedMatch(completedMatch("soccer", `challenge-${index}`, "A"), "challenge", "A", { targetScore: 50, storage });
  }
  progress = loadProgress(storage);
  assert(progress.recent.length === 10, "recent history is capped at ten drafts");
  assert(progress.recordedMatchIds.length === 15, "exactly-once IDs remain available beyond the visible history");
  assert(progress.achievements.some((achievement) => achievement.id === "getting-the-hang"), "aggregate draft milestones unlock from all-time records");
}

{
  const storage = new MemoryStorage();
  recordCompletedMatch(completedMatch("soccer", "local-only", "A"), "local", null, { storage });
  assert(loadProgress(storage).achievements.length === 0, "couch drafts do not unlock competitive achievements");
}

{
  const storage = new MemoryStorage();
  for (let index = 0; index < 7; index++) {
    recordCompletedMatch(completedMatch("basketball", `daily-${index}`, "A"), "daily", "A", { storage });
  }
  assert(loadProgress(storage).achievements.some((achievement) => achievement.id === "daily-routine"), "seven daily drafts unlock Daily Routine");
}

{
  const storage = new MemoryStorage();
  storage.setItem("your-five:ai-record:soccer:expert", JSON.stringify({ wins: 4, losses: 2, ties: 1 }));
  storage.setItem("your-five:daily-best-score:soccer", "87.5");
  const progress = loadProgress(storage);
  assert(
    progress.sports.soccer.modes["ai-expert"]?.wins === 4 && progress.sports.soccer.overall.losses === 2,
    "legacy Quick AI records migrate without inventing match history"
  );
  assert(progress.sports.soccer.bestScore === 87.5, "legacy daily best scores migrate");
  assert(progress.recent.length === 0, "legacy aggregate records do not invent recent drafts");
  assert(progress.achievements.some((achievement) => achievement.id === "against-the-odds"), "legacy aggregate records unlock achievements they can prove");
  assert(storage.getItem(PROGRESS_KEY) !== null, "migration writes the versioned progress document");
}

{
  const storage = new MemoryStorage();
  storage.setItem(PROGRESS_KEY, JSON.stringify({
    version: 1,
    sports: {
      basketball: { overall: { wins: "2" }, modes: null, currentWinStreak: "bad", bestScore: "bad" },
      soccer: null,
    },
    migratedLegacy: true,
  }));
  const progress = loadProgress(storage);
  assert(progress.sports.basketball.overall.wins === 2, "partially valid legacy progress keeps its safe record values");
  assert(Object.keys(progress.sports.basketball.modes).length === 0, "invalid legacy mode records normalize to an empty map");
  assert(progress.sports.soccer.currentWinStreak === 0, "missing sport progress normalizes to safe defaults");
  assert(progressRecordFor("basketball", "ai-competitive", storage).wins === 0, "the AI chooser can read a repaired legacy mode record");
}

if (failures > 0) {
  console.error(`\n${failures} progress test(s) failed.`);
  process.exit(1);
}
console.log("\nAll progress tests passed.");
