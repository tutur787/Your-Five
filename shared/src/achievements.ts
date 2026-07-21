export const ACHIEVEMENT_DEFINITIONS = [
  { id: "first-five", category: "Milestones", title: "Your First Five", description: "Complete your first draft." },
  { id: "getting-the-hang", category: "Milestones", title: "Getting the Hang of It", description: "Complete 10 drafts." },
  { id: "front-office-veteran", category: "Milestones", title: "Front Office Veteran", description: "Complete 50 drafts." },
  { id: "both-sides", category: "Milestones", title: "Both Sides of the Ball", description: "Win a basketball draft and a football draft." },
  { id: "daily-routine", category: "Milestones", title: "Daily Routine", description: "Complete seven daily challenges." },
  { id: "perfect-fit", category: "Draft Craft", title: "Perfect Fit", description: "Finish with every player in a sourced position." },
  { id: "cap-manager", category: "Draft Craft", title: "Cap Manager", description: "Win while keeping at least $5." },
  { id: "no-thanks", category: "Draft Craft", title: "No Thanks", description: "Win without using a skip." },
  { id: "value-five", category: "Draft Craft", title: "Value Five", description: "Win without paying more than $4 for any player." },
  { id: "full-budget", category: "Draft Craft", title: "Full Budget", description: "Finish a draft having spent exactly $20." },
  { id: "photo-finish", category: "Competition", title: "Photo Finish", description: "Win by less than one point." },
  { id: "statement-win", category: "Competition", title: "Statement Win", description: "Win by at least 10 points." },
  { id: "against-the-odds", category: "Competition", title: "Against the Odds", description: "Beat the Expert AI." },
  { id: "online-debut", category: "Competition", title: "Online Debut", description: "Complete an online match." },
  { id: "road-winner", category: "Competition", title: "Road Winner", description: "Win a random online match." },
  { id: "hot-hand", category: "Competition", title: "Hot Hand", description: "Win three consecutive drafts in one sport." },
  { id: "dynasty", category: "Competition", title: "Dynasty", description: "Win 10 consecutive drafts in one sport." },
  { id: "ninety-club", category: "Competition", title: "90 Club", description: "Post a score of at least 90." },
  { id: "challenge-accepted", category: "Competition", title: "Challenge Accepted", description: "Beat the target score in a shared challenge." },
  { id: "two-sport-star", category: "Competition", title: "Two-Sport Star", description: "Post a score of at least 80 in both sports." },
] as const;

export type AchievementDefinition = typeof ACHIEVEMENT_DEFINITIONS[number];
export type AchievementId = AchievementDefinition["id"];

export const ACHIEVEMENT_IDS = ACHIEVEMENT_DEFINITIONS.map((achievement) => achievement.id) as AchievementId[];

export interface AchievementUnlock {
  id: AchievementId;
  unlockedAt: string;
  matchId?: string;
}
