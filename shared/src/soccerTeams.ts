export interface SoccerTeamMetadata {
  name: string;
  code: string;
}

/** Club names and codes carried by the committed UEFA card set, keyed by UEFA team ID. */
export const SOCCER_TEAM_METADATA: Readonly<Record<string, SoccerTeamMetadata>> = {
  "1652": { name: "Tottenham", code: "TOT" },
  "7889": { name: "Liverpool", code: "LIV" },
  "50037": { name: "Bayern München", code: "BAY" },
  "50051": { name: "Real Madrid", code: "RMA" },
  "50058": { name: "Milan", code: "MIL" },
  "50064": { name: "Porto", code: "POR" },
  "50080": { name: "Barcelona", code: "BAR" },
  "50109": { name: "Leverkusen", code: "LEV" },
  "50124": { name: "Atleti", code: "ATM" },
  "50138": { name: "Inter", code: "INT" },
  "50139": { name: "Juventus", code: "JUV" },
  "50143": { name: "Ajax", code: "AJX" },
  "52268": { name: "Valencia", code: "VAL" },
  "52280": { name: "Arsenal", code: "ARS" },
  "52682": { name: "Man Utd", code: "MUN" },
  "52692": { name: "Fenerbahçe", code: "FEN" },
  "52714": { name: "Sevilla", code: "SEV" },
  "52747": { name: "Paris", code: "PSG" },
  "52758": { name: "B. Dortmund", code: "BVB" },
  "52914": { name: "Chelsea", code: "CHE" },
  "52919": { name: "Man City", code: "MCI" },
  "53344": { name: "Blackburn", code: "BLA" },
  "69619": { name: "Alavés", code: "ALA" },
};

export function soccerTeamMetadata(teamIds: readonly string[]): SoccerTeamMetadata | undefined {
  return teamIds.map((teamId) => SOCCER_TEAM_METADATA[teamId]).find(Boolean);
}
