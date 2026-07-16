import type {
  LineupSlot,
  RosterPick,
  SoccerPlayerCard,
  SoccerRole,
  SoccerSlot,
  TeamState,
} from "./types";

export const SOCCER_POSITION_MISMATCH: Record<SoccerRole, Record<SoccerRole, number>> = {
  GK: { GK: 0, DEF: 30, MID: 30, ATT: 30 },
  DEF: { GK: 30, DEF: 0, MID: 6, ATT: 16 },
  MID: { GK: 30, DEF: 6, MID: 0, ATT: 5 },
  ATT: { GK: 30, DEF: 16, MID: 5, ATT: 0 },
};

export const SOCCER_CHEMISTRY_PER_PAIR = 4;
export const SOCCER_CHEMISTRY_CAP = 12;
export const SOCCER_HONORS_CAP = 15;

export function soccerRoleForSlot(slot: LineupSlot): SoccerRole | null {
  if (slot === "GK") return "GK";
  if (slot === "DEF_L" || slot === "DEF_R") return "DEF";
  if (slot === "MID") return "MID";
  if (slot === "ATT") return "ATT";
  return null;
}

export function validSoccerRoles(player: SoccerPlayerCard): SoccerRole[] {
  return [player.role, player.secondaryRole, player.tertiaryRole].filter(
    (role): role is SoccerRole => Boolean(role)
  );
}

export function soccerSlotsForPlayer(player: SoccerPlayerCard): SoccerSlot[] {
  const roles = validSoccerRoles(player);
  const slots: SoccerSlot[] = [];
  if (roles.includes("GK")) slots.push("GK");
  if (roles.includes("DEF")) slots.push("DEF_L", "DEF_R");
  if (roles.includes("MID")) slots.push("MID");
  if (roles.includes("ATT")) slots.push("ATT");
  return slots;
}

export function soccerPositionPenalty(player: SoccerPlayerCard, slot: LineupSlot): number {
  const slotRole = soccerRoleForSlot(slot);
  if (!slotRole) return 30;
  const validRoles = validSoccerRoles(player);
  if (validRoles.includes(slotRole)) return 0;
  return Math.min(...validRoles.map((role) => SOCCER_POSITION_MISMATCH[role][slotRole]));
}

export interface SoccerChemistryPair {
  a: RosterPick;
  b: RosterPick;
}

export function soccerChemistryPairs(team: TeamState): SoccerChemistryPair[] {
  const picks = team.roster.filter((pick): pick is RosterPick & { player: SoccerPlayerCard } => pick.player.sport === "soccer");
  const pairs: SoccerChemistryPair[] = [];
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      if (picks[i].player.edition === picks[j].player.edition && picks[i].player.team === picks[j].player.team) {
        pairs.push({ a: picks[i], b: picks[j] });
      }
    }
  }
  return pairs;
}

export interface SoccerFitAssessment {
  creatorBonus: number;
  ballWinnerBonus: number;
  scorerBonus: number;
  progressionBonus: number;
  attackDominantPlayers: number;
  stackingPenalty: number;
  total: number;
}

export function soccerFitAssessment(team: TeamState): SoccerFitAssessment {
  const players = team.roster
    .map((pick) => pick.player)
    .filter((player): player is SoccerPlayerCard => player.sport === "soccer");
  const creatorBonus = players.some((player) => player.performance.creation >= 14) ? 3 : 0;
  const ballWinnerBonus = players.some((player) => player.performance.defense >= 14) ? 3 : 0;
  const scorerBonus = players.some((player) => player.performance.attack >= 14) ? 3 : 0;
  const progressionBonus = players.some((player) => player.performance.progression >= 14) ? 2 : 0;
  const attackDominantPlayers = players.filter(
    (player) => player.role !== "GK" && player.performance.attack >= 14 && player.performance.attack === Math.max(
      player.performance.attack,
      player.performance.creation,
      player.performance.progression,
      player.performance.defense,
      player.performance.goalkeeping
    )
  ).length;
  const stackingPenalty = Math.max(0, attackDominantPlayers - 2) * 4;
  const total = Math.max(-12, Math.min(11, creatorBonus + ballWinnerBonus + scorerBonus + progressionBonus - stackingPenalty));
  return { creatorBonus, ballWinnerBonus, scorerBonus, progressionBonus, attackDominantPlayers, stackingPenalty, total };
}

export interface SoccerScoreComponents {
  performance: { attack: number; creation: number; progression: number; defense: number; goalkeeping: number; total: number };
  teamSuccess: number;
  honors: number;
  fit: SoccerFitAssessment;
  chemistry: { pairs: SoccerChemistryPair[]; bonus: number };
  mismatches: Array<{ pick: RosterPick; penalty: number }>;
  wrongPositionPenalty: number;
  total: number;
}

export function soccerScoreComponents(team: TeamState): SoccerScoreComponents {
  const picks = team.roster.filter((pick): pick is RosterPick & { player: SoccerPlayerCard } => pick.player.sport === "soccer");
  const performance = picks.reduce(
    (sum, pick) => ({
      attack: sum.attack + pick.player.performance.attack,
      creation: sum.creation + pick.player.performance.creation,
      progression: sum.progression + pick.player.performance.progression,
      defense: sum.defense + pick.player.performance.defense,
      goalkeeping: sum.goalkeeping + pick.player.performance.goalkeeping,
      total: sum.total + pick.player.performance.roleScore,
    }),
    { attack: 0, creation: 0, progression: 0, defense: 0, goalkeeping: 0, total: 0 }
  );
  const teamSuccess = picks.reduce((sum, pick) => sum + pick.player.teamSuccess, 0);
  const honors = Math.min(
    SOCCER_HONORS_CAP,
    picks.reduce((sum, pick) => sum + (pick.player.honors?.champion ? 3 : 0) +
      (pick.player.honors?.bestPlayer ? 3 : 0) + (pick.player.honors?.topScorerOrKeeper ? 2 : 0), 0)
  );
  const fit = soccerFitAssessment(team);
  const pairs = soccerChemistryPairs(team);
  const chemistry = { pairs, bonus: Math.min(SOCCER_CHEMISTRY_CAP, pairs.length * SOCCER_CHEMISTRY_PER_PAIR) };
  const mismatches = picks
    .map((pick) => ({ pick, penalty: soccerPositionPenalty(pick.player, pick.slot) }))
    .filter(({ penalty }) => penalty > 0);
  const wrongPositionPenalty = mismatches.reduce((sum, mismatch) => sum + mismatch.penalty, 0);
  const total = performance.total + teamSuccess + honors + fit.total + chemistry.bonus - wrongPositionPenalty;
  return { performance, teamSuccess, honors, fit, chemistry, mismatches, wrongPositionPenalty, total };
}

export function soccerPlayerCompositeValue(player: SoccerPlayerCard): number {
  const honors = (player.honors?.champion ? 3 : 0) + (player.honors?.bestPlayer ? 3 : 0) +
    (player.honors?.topScorerOrKeeper ? 2 : 0);
  return player.performance.roleScore + player.teamSuccess + honors;
}
