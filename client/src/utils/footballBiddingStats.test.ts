import assert from "node:assert/strict";
import { SOCCER_RUNTIME } from "@fiveaside/shared/soccer-runtime";
import { PREMIER_LEAGUE_RUNTIME } from "@fiveaside/shared/football-premier-league-runtime";
import { LALIGA_RUNTIME } from "@fiveaside/shared/football-laliga-runtime";
import { SERIE_A_RUNTIME } from "@fiveaside/shared/football-serie-a-runtime";
import { BUNDESLIGA_RUNTIME } from "@fiveaside/shared/football-bundesliga-runtime";
import { LIGUE_1_RUNTIME } from "@fiveaside/shared/football-ligue-1-runtime";
import type { SoccerPlayerCard, SoccerRole } from "@fiveaside/shared/core";
import { footballBiddingStats } from "./footballBiddingStats";

const runtimes = [
  SOCCER_RUNTIME,
  PREMIER_LEAGUE_RUNTIME,
  LALIGA_RUNTIME,
  SERIE_A_RUNTIME,
  BUNDESLIGA_RUNTIME,
  LIGUE_1_RUNTIME,
] as const;

const uefaLabels: Record<SoccerRole, readonly string[]> = {
  GK: ["APPS", "CLEAN SHEETS", "GOALS ALLOWED", "MIN", "TEAM PPM"],
  DEF: ["APPS", "CLEAN SHEETS", "GOALS CONCEDED", "MIN", "TEAM PPM"],
  MID: ["APPS", "GOALS", "ASSISTS", "MIN", "TEAM PPM"],
  ATT: ["APPS", "GOALS", "ASSISTS", "SOT", "MIN"],
};

const bundesligaLabels: Record<SoccerRole, readonly string[]> = {
  GK: ["APPS", "SAVES", "CLEAN SHEETS", "GOALS ALLOWED", "BALL ACTIONS"],
  DEF: ["APPS", "CLEAN SHEETS", "GOALS CONCEDED", "DUELS WON", "AERIAL DUELS"],
  MID: ["APPS", "GOALS", "ASSISTS", "BALL ACTIONS", "DUELS WON"],
  ATT: ["APPS", "GOALS", "ASSISTS", "SOT", "BALL ACTIONS"],
};

const domesticLabels: Record<SoccerRole, readonly string[]> = {
  GK: ["APPS", "SAVES", "CLEAN SHEETS", "GOALS ALLOWED", "CLAIMS"],
  DEF: ["APPS", "CLEAN SHEETS", "GOALS CONCEDED", "TACKLES", "CLEARANCES"],
  MID: ["APPS", "GOALS", "ASSISTS", "PASSES", "PROG. PASSES"],
  ATT: ["APPS", "GOALS", "ASSISTS", "SOT", "MIN"],
};

let audited = 0;
for (const runtime of runtimes) {
  for (const player of runtime.database as readonly SoccerPlayerCard[]) {
    const values = footballBiddingStats(player);
    const expected = runtime.competition === "uefa-all-time"
      ? uefaLabels[player.role]
      : runtime.competition === "bundesliga-2025-26"
        ? bundesligaLabels[player.role]
        : domesticLabels[player.role];
    assert.equal(values.length, 5, `${player.id} renders five bidding values`);
    assert.deepEqual(values.map(([label]) => label), expected, `${player.id} uses the correct ${player.role} display profile`);
    assert.ok(values.every(([, value]) => Number.isFinite(value)), `${player.id} has no empty bidding values`);
    assert.equal(new Set(values.map(([label]) => label)).size, 5, `${player.id} has no duplicate bidding labels`);
    audited += 1;
  }
}

assert.equal(audited, 1_354, "all UEFA and domestic football cards are audited");
console.log(`Football bidding-stat audit passed for ${audited} cards.`);
