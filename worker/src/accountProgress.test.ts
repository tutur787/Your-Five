import { emptyAccountProgress, mergeAccountProgress, sanitizeAccountProgress } from "./accountProgress";

let failures = 0;
function assert(condition: unknown, message: string): void {
  if (condition) console.log(`ok: ${message}`);
  else {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

function entry(matchId: string, result: "win" | "loss" | "tie" = "win") {
  return {
    matchId,
    completedAt: "2026-07-21T12:00:00.000Z",
    sport: "basketball" as const,
    mode: "ai-competitive" as const,
    result,
    scoreFor: 71.2,
    scoreAgainst: 65.4,
    lineup: ["A", "B", "C", "D", "E"],
    opponentLineup: ["F", "G", "H", "I", "J"],
  };
}

{
  const local = emptyAccountProgress();
  local.sports.basketball.overall.wins = 4;
  local.sports.basketball.currentWinStreak = 2;
  const imported = mergeAccountProgress(null, local);
  assert(imported.sports.basketball.overall.wins === 4, "the first account device imports its aggregate record");
  assert(imported.sports.basketball.currentWinStreak === 2, "the first import preserves its win streak");
  local.achievements = [{ id: "first-five", unlockedAt: "2026-07-21T12:00:00.000Z" }];
  assert(mergeAccountProgress(null, local).achievements[0]?.id === "first-five", "the first device imports earned achievements");
}

{
  const cloud = emptyAccountProgress();
  cloud.recent = [entry("known")];
  cloud.recordedMatchIds = ["known"];
  cloud.sports.basketball.overall.wins = 1;
  cloud.sports.basketball.modes["ai-competitive"] = { wins: 1, losses: 0, ties: 0 };
  const local = structuredClone(cloud);
  local.recent = [entry("new"), entry("known")];
  local.recordedMatchIds.push("new");
  const merged = mergeAccountProgress(cloud, local);
  assert(merged.sports.basketball.overall.wins === 2, "a new match is added to the cloud record");
  assert(merged.recordedMatchIds.filter((id) => id === "known").length === 1, "known match IDs are not counted twice");

  local.achievements = [{ id: "online-debut", unlockedAt: "2026-07-21T13:00:00.000Z", matchId: "new" }];
  const mergedAchievements = mergeAccountProgress(cloud, local);
  assert(mergedAchievements.achievements[0]?.id === "online-debut", "achievements earned on another device merge into the account");
}

{
  const sanitized = sanitizeAccountProgress({
    sports: {
      basketball: { overall: { wins: -2, losses: "3", ties: 0 }, bestScore: Number.POSITIVE_INFINITY },
      soccer: {},
    },
    recent: [{ ...entry("bad-score"), scoreFor: Number.NaN, lineup: new Array(20).fill("Player") }],
    recordedMatchIds: ["bad-score", "bad-score"],
    achievements: [
      { id: "first-five", unlockedAt: "2026-07-21T12:00:00.000Z" },
      { id: "not-real", unlockedAt: "2026-07-21T12:00:00.000Z" },
    ],
  });
  assert(sanitized.sports.basketball.overall.wins === 0 && sanitized.sports.basketball.overall.losses === 3, "account totals are bounded and normalized");
  assert(sanitized.recent[0].scoreFor === 0 && sanitized.recent[0].lineup.length === 5, "history payloads are bounded before storage");
  assert(sanitized.recordedMatchIds.length === 1, "recorded match IDs are deduplicated");
  assert(sanitized.achievements.length === 1 && sanitized.achievements[0].id === "first-five", "unknown achievement IDs are rejected");
}

if (failures > 0) throw new Error(`${failures} account progress test(s) failed.`);
console.log("\nAll account progress tests passed.");
