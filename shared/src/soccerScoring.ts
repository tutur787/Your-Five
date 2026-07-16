import type {
  LineupSlot,
  RosterPick,
  SoccerPlayerCard,
  SoccerHonors,
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
export const SOCCER_HONORS_CAP = 20;
export const SOCCER_HONOR_POINTS = {
  champion: 3,
  majorIndividual: 5,
  topScorer: 2,
  positionalAward: 2,
  youngPlayer: 1,
} as const;

export interface SoccerHonorDetail {
  label: string;
  points: number;
}

export function soccerMajorIndividualLabels(honors: SoccerHonors | undefined): string[] {
  if (!honors) return [];
  return [
    honors.bestPlayer ? honors.bestPlayerLabel ?? "UEFA best-player award" : null,
    honors.ballonDor ? honors.ballonDorLabel ?? "Ballon d'Or" : null,
  ].filter((label): label is string => Boolean(label));
}

export function soccerHonorDetails(honors: SoccerHonors | undefined): SoccerHonorDetail[] {
  if (!honors) return [];
  const details: SoccerHonorDetail[] = [];
  if (honors.champion) {
    details.push({ label: honors.championLabel ?? "UEFA competition winner", points: SOCCER_HONOR_POINTS.champion });
  }
  soccerMajorIndividualLabels(honors).forEach((label, index) => {
    details.push({ label, points: index === 0 ? SOCCER_HONOR_POINTS.majorIndividual : 0 });
  });

  const legacyLabel = honors.topScorerOrKeeperLabel ?? "UEFA top-scorer or goalkeeper award";
  const legacyIsGoalkeeper = honors.topScorerOrKeeper && /goalkeeper/i.test(legacyLabel);
  const topScorerLabel = honors.topScorer
    ? honors.topScorerLabel ?? "UEFA Champions League top scorer"
    : honors.topScorerOrKeeper && !legacyIsGoalkeeper ? legacyLabel : null;
  const positionalLabel = honors.positionalAward
    ? honors.positionalAwardLabel ?? "UEFA Champions League positional award"
    : legacyIsGoalkeeper ? legacyLabel : null;
  if (topScorerLabel) details.push({ label: topScorerLabel, points: SOCCER_HONOR_POINTS.topScorer });
  if (positionalLabel) details.push({ label: positionalLabel, points: SOCCER_HONOR_POINTS.positionalAward });
  if (honors.youngPlayer) {
    details.push({
      label: honors.youngPlayerLabel ?? "UEFA Champions League Young Player of the Season",
      points: SOCCER_HONOR_POINTS.youngPlayer,
    });
  }
  return details;
}

export function soccerHonorPoints(honors: SoccerHonors | undefined): number {
  return soccerHonorDetails(honors).reduce((sum, honor) => sum + honor.points, 0);
}

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
      const sharedTeam = picks[i].player.sourceTeamIds.some((teamId) => picks[j].player.sourceTeamIds.includes(teamId));
      if (picks[i].player.edition === picks[j].player.edition && sharedTeam) {
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
  controlBonus: number;
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
  const controlBonus = players.some((player) => player.performance.control >= 14) ? 2 : 0;
  const attackDominantPlayers = players.filter(
    (player) => player.role !== "GK" && player.performance.attack >= 14 && player.performance.attack === Math.max(
      player.performance.attack,
      player.performance.creation,
      player.performance.control,
      player.performance.defense,
      player.performance.goalkeeping
    )
  ).length;
  const stackingPenalty = Math.max(0, attackDominantPlayers - 2) * 4;
  const total = Math.max(-12, Math.min(11, creatorBonus + ballWinnerBonus + scorerBonus + controlBonus - stackingPenalty));
  return { creatorBonus, ballWinnerBonus, scorerBonus, controlBonus, attackDominantPlayers, stackingPenalty, total };
}

export interface SoccerScoreComponents {
  performance: { attack: number; creation: number; control: number; defense: number; goalkeeping: number; total: number };
  teamSuccess: number;
  honors: number;
  honorsUncapped: number;
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
      control: sum.control + pick.player.performance.control,
      defense: sum.defense + pick.player.performance.defense,
      goalkeeping: sum.goalkeeping + pick.player.performance.goalkeeping,
      total: sum.total + pick.player.performance.roleScore,
    }),
    { attack: 0, creation: 0, control: 0, defense: 0, goalkeeping: 0, total: 0 }
  );
  const teamSuccess = picks.reduce((sum, pick) => sum + pick.player.teamSuccess, 0);
  const honorsUncapped = picks.reduce((sum, pick) => sum + soccerHonorPoints(pick.player.honors), 0);
  const honors = Math.min(SOCCER_HONORS_CAP, honorsUncapped);
  const fit = soccerFitAssessment(team);
  const pairs = soccerChemistryPairs(team);
  const chemistry = { pairs, bonus: Math.min(SOCCER_CHEMISTRY_CAP, pairs.length * SOCCER_CHEMISTRY_PER_PAIR) };
  const mismatches = picks
    .map((pick) => ({ pick, penalty: soccerPositionPenalty(pick.player, pick.slot) }))
    .filter(({ penalty }) => penalty > 0);
  const wrongPositionPenalty = mismatches.reduce((sum, mismatch) => sum + mismatch.penalty, 0);
  const total = performance.total + teamSuccess + honors + fit.total + chemistry.bonus - wrongPositionPenalty;
  return { performance, teamSuccess, honors, honorsUncapped, fit, chemistry, mismatches, wrongPositionPenalty, total };
}

export function soccerPlayerCompositeValue(player: SoccerPlayerCard): number {
  return player.performance.roleScore + player.teamSuccess + soccerHonorPoints(player.honors);
}
