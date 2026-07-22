import { normalizeFootballCompetition, type SoccerPlayerCard } from "@fiveaside/shared/core";

export type FootballBiddingStat = readonly [label: string, value: number];

function stat(label: string, value: number | undefined): FootballBiddingStat | null {
  return value !== undefined && Number.isFinite(value) ? [label, value] : null;
}

function complete(values: Array<FootballBiddingStat | null>, player: SoccerPlayerCard): FootballBiddingStat[] {
  const available = values.filter((value): value is FootballBiddingStat => value !== null);
  if (available.length !== 5) {
    throw new Error(`${player.competition ?? "uefa-all-time"}:${player.id} has ${available.length} bidding stats; expected 5`);
  }
  return available;
}

/** Five source-backed headline values shown for every football card during bidding. */
export function footballBiddingStats(player: SoccerPlayerCard): FootballBiddingStat[] {
  const { stats } = player;
  const competition = normalizeFootballCompetition(player.competition);

  if (competition === "uefa-all-time") {
    if (player.role === "GK" || player.role === "DEF") {
      return complete([
        stat("APPS", stats.appearances),
        stat("CLEAN SHEETS", stats.cleanSheets),
        stat(player.role === "GK" ? "GOALS ALLOWED" : "GOALS CONCEDED", stats.goalsConceded),
        stat("MIN", stats.minutes),
        stat("TEAM PPM", stats.pointsPerMatch),
      ], player);
    }
    if (player.role === "MID") {
      return complete([
        stat("APPS", stats.appearances), stat("GOALS", stats.goals), stat("ASSISTS", stats.assists),
        stat("MIN", stats.minutes), stat("TEAM PPM", stats.pointsPerMatch),
      ], player);
    }
    return complete([
      stat("APPS", stats.appearances), stat("GOALS", stats.goals), stat("ASSISTS", stats.assists),
      stat("SOT", stats.shotsOnTarget), stat("MIN", stats.minutes),
    ], player);
  }

  if (competition === "bundesliga-2025-26") {
    if (player.role === "GK") {
      return complete([
        stat("APPS", stats.appearances), stat("SAVES", stats.saves), stat("CLEAN SHEETS", stats.cleanSheets),
        stat("GOALS ALLOWED", stats.goalsConceded), stat("BALL ACTIONS", stats.ballActions),
      ], player);
    }
    if (player.role === "DEF") {
      return complete([
        stat("APPS", stats.appearances), stat("CLEAN SHEETS", stats.cleanSheets),
        stat("GOALS CONCEDED", stats.goalsConceded), stat("DUELS WON", stats.duelsWon),
        stat("AERIAL DUELS", stats.aerialDuelsWon),
      ], player);
    }
    if (player.role === "MID") {
      return complete([
        stat("APPS", stats.appearances), stat("GOALS", stats.goals), stat("ASSISTS", stats.assists),
        stat("BALL ACTIONS", stats.ballActions), stat("DUELS WON", stats.duelsWon),
      ], player);
    }
    return complete([
      stat("APPS", stats.appearances), stat("GOALS", stats.goals), stat("ASSISTS", stats.assists),
      stat("SOT", stats.shotsOnTarget), stat("BALL ACTIONS", stats.ballActions),
    ], player);
  }

  if (player.role === "GK") {
    return complete([
      stat("APPS", stats.appearances), stat("SAVES", stats.saves), stat("CLEAN SHEETS", stats.cleanSheets),
      stat("GOALS ALLOWED", stats.goalsConceded), stat("CLAIMS", stats.claims),
    ], player);
  }
  if (player.role === "DEF") {
    return complete([
      stat("APPS", stats.appearances), stat("CLEAN SHEETS", stats.cleanSheets),
      stat("GOALS CONCEDED", stats.goalsConceded), stat("TACKLES", stats.tacklesWon),
      stat("CLEARANCES", stats.clearances),
    ], player);
  }
  if (player.role === "MID") {
    return complete([
      stat("APPS", stats.appearances), stat("GOALS", stats.goals), stat("ASSISTS", stats.assists),
      stat("PASSES", stats.passes), stat("PROG. PASSES", stats.progressiveDeliveries),
    ], player);
  }
  return complete([
    stat("APPS", stats.appearances), stat("GOALS", stats.goals), stat("ASSISTS", stats.assists),
    stat("SOT", stats.shotsOnTarget), stat("MIN", stats.minutes),
  ], player);
}
