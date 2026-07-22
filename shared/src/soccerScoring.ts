import type {
  LineupSlot,
  RosterPick,
  SoccerPlayerCard,
  SoccerHonors,
  SoccerRole,
  SoccerSlot,
  TeamState,
} from "./types";
import { normalizeFootballCompetition } from "./footballCompetitions";

export const SOCCER_POSITION_MISMATCH: Record<SoccerRole, Record<SoccerRole, number>> = {
  GK: { GK: 0, DEF: 30, MID: 30, ATT: 30 },
  DEF: { GK: 30, DEF: 0, MID: 6, ATT: 16 },
  MID: { GK: 30, DEF: 6, MID: 0, ATT: 5 },
  ATT: { GK: 30, DEF: 16, MID: 5, ATT: 0 },
};

export const SOCCER_CHEMISTRY_PER_PAIR = 1;
export const SOCCER_CHEMISTRY_CAP = 4;
export const SOCCER_HONORS_CAP = 12;
export const SOCCER_TEAM_SUCCESS_WEIGHT = 0.6;
export const SOCCER_HONOR_POINTS = {
  champion: 2,
  majorIndividual: 4,
  topScorer: 2,
  positionalAward: 1.5,
  youngPlayer: 1,
} as const;

const SOCCER_CALENDAR_SELECTION_BASE = 13;
const SOCCER_SEASON_SELECTION_BASE = 12;
const SOCCER_EDITION_ADJUSTMENT = 0.45;
const SOCCER_PEDIGREE_BONUS_CAP = 3;

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
  if (slot === "DEF" || slot === "DEF_L" || slot === "DEF_R") return "DEF";
  if (slot === "MID") return "MID";
  if (slot === "ATT" || slot === "ATT_L" || slot === "ATT_R") return "ATT";
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
  if (roles.includes("DEF")) slots.push("DEF");
  if (roles.includes("MID")) slots.push("MID");
  if (roles.includes("ATT")) slots.push("ATT_L", "ATT_R");
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

/** The historical teammate test shared by scoring and auction previews. */
export function soccerPlayersHaveChemistry(a: SoccerPlayerCard, b: SoccerPlayerCard): boolean {
  if (a.chemistryWith || b.chemistryWith) {
    return Boolean(a.chemistryWith?.includes(b.id) || b.chemistryWith?.includes(a.id));
  }
  // Rooms created before the historical teammate ledger retain their old chemistry behavior.
  return a.edition === b.edition && a.sourceTeamIds.some((teamId) => b.sourceTeamIds.includes(teamId));
}

export function soccerChemistryPartners(team: TeamState, player: SoccerPlayerCard): RosterPick[] {
  return team.roster.filter(
    (pick) => pick.player.sport === "soccer" && soccerPlayersHaveChemistry(player, pick.player)
  );
}

export function soccerChemistryPairs(team: TeamState): SoccerChemistryPair[] {
  const picks = team.roster.filter((pick): pick is RosterPick & { player: SoccerPlayerCard } => pick.player.sport === "soccer");
  const pairs: SoccerChemistryPair[] = [];
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      if (soccerPlayersHaveChemistry(picks[i].player, picks[j].player)) {
        pairs.push({ a: picks[i], b: picks[j] });
      }
    }
  }
  return pairs;
}

export interface SoccerFitAssessment {
  creatorBonus: number;
  defensiveAnchorBonus: number;
  scorerBonus: number;
  goalkeeperBonus: number;
  attackDominantPlayers: number;
  stackingPenalty: number;
  total: number;
}

export function soccerFitAssessment(team: TeamState): SoccerFitAssessment {
  const players = team.roster
    .map((pick) => pick.player)
    .filter((player): player is SoccerPlayerCard => player.sport === "soccer");
  const creatorBonus = players.some(
    (player) => (player.role === "MID" || player.role === "ATT") && player.performance.creation >= 12
  ) ? 1 : 0;
  const defensiveAnchorBonus = players.some(
    (player) => player.role === "DEF" && player.performance.defense >= 12
  ) ? 1 : 0;
  const scorerBonus = players.some(
    (player) => player.role === "ATT" && player.performance.attack >= 12
  ) ? 1 : 0;
  const goalkeeperBonus = players.some(
    (player) => player.role === "GK" && player.performance.goalkeeping >= 12
  ) ? 1 : 0;
  const attackDominantPlayers = players.filter(
    (player) => (player.role === "MID" || player.role === "ATT") &&
      player.performance.attack >= 14
  ).length;
  const stackingPenalty = Math.max(0, attackDominantPlayers - 2) * 2;
  const total = Math.max(-4, Math.min(4, creatorBonus + defensiveAnchorBonus + scorerBonus + goalkeeperBonus - stackingPenalty));
  return { creatorBonus, defensiveAnchorBonus, scorerBonus, goalkeeperBonus, attackDominantPlayers, stackingPenalty, total };
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Performance-led card quality for UEFA-selected players.
 *
 * Selection into a UEFA XI/squad establishes an elite baseline. Reliable edition data can move
 * that baseline by at most 3.6 points, while repeat-selection pedigree is limited to a 3-point
 * tie-break so a famous name cannot erase a poor card window. Exact accolades remain separate.
 */
export function soccerPlayerQuality(player: SoccerPlayerCard): number {
  if (normalizeFootballCompetition(player.competition) !== "uefa-all-time") {
    return clamp(player.performance.domesticQuality ?? player.performance.roleScore, 6, 18);
  }
  const achievementScore = player.performance.achievementScore;
  if (achievementScore !== undefined) {
    return Math.max(0, Math.min(20, (player.performance.roleScore - achievementScore * 0.15) / 0.85));
  }

  const observed = player.performance.observedScore;
  const pedigree = player.performance.pedigreeScore;
  const confidence = player.performance.dataConfidence;
  if (observed === undefined || pedigree === undefined || confidence === undefined) {
    return clamp(player.performance.roleScore, 8, 20);
  }

  const selectionBase = player.editionKind === "calendar"
    ? SOCCER_CALENDAR_SELECTION_BASE
    : SOCCER_SEASON_SELECTION_BASE;
  const reliableConfidence = clamp(confidence, 0, 0.8);
  const editionAdjustment = (clamp(observed, 0, 20) - 10)
    * SOCCER_EDITION_ADJUSTMENT
    * reliableConfidence;
  const pedigreeBonus = clamp((pedigree - 8) / 12, 0, 1) * SOCCER_PEDIGREE_BONUS_CAP;
  return clamp(selectionBase + editionAdjustment + pedigreeBonus, 8, 20);
}

export function soccerTeamSuccessValue(player: SoccerPlayerCard): number {
  if (normalizeFootballCompetition(player.competition) !== "uefa-all-time") {
    return clamp(player.teamSuccess, -2, 2);
  }
  return player.teamSuccess * SOCCER_TEAM_SUCCESS_WEIGHT;
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
      total: sum.total + soccerPlayerQuality(pick.player),
    }),
    { attack: 0, creation: 0, control: 0, defense: 0, goalkeeping: 0, total: 0 }
  );
  const teamSuccess = picks.reduce((sum, pick) => sum + soccerTeamSuccessValue(pick.player), 0);
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
  return soccerPlayerQuality(player) + soccerTeamSuccessValue(player) + soccerHonorPoints(player.honors);
}
