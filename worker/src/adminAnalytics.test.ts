import { emptyAccountProgress } from "./accountProgress";
import { isAdminEmail, progressGameTotals } from "./adminAnalytics";

let failures = 0;
function assert(condition: unknown, message: string): void {
  if (condition) console.log(`ok: ${message}`);
  else {
    failures += 1;
    console.error(`FAIL: ${message}`);
  }
}

assert(isAdminEmail("owner@example.com", "owner@example.com"), "an exact configured owner is accepted");
assert(isAdminEmail("OWNER@example.com", " owner@example.com, second@example.com "), "the allowlist is case-insensitive and comma-separated");
assert(!isAdminEmail("visitor@example.com", "owner@example.com"), "an unlisted account is rejected");
assert(!isAdminEmail("owner@example.com", undefined), "a missing allowlist grants no access");

const progress = emptyAccountProgress();
progress.sports.basketball.overall = { wins: 3, losses: 2, ties: 1 };
progress.sports.soccer.overall = { wins: 4, losses: 5, ties: 2 };
const totals = progressGameTotals(progress);
assert(totals.basketball === 6 && totals.football === 11 && totals.total === 17, "game totals include wins, losses, and ties by sport");

if (failures > 0) throw new Error(`${failures} admin analytics test(s) failed.`);
console.log("\nAdmin analytics tests passed.");
