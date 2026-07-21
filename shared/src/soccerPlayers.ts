import {
  SOCCER_PLAYER_DATABASE as GENERATED_SOCCER_PLAYER_DATABASE,
  SOCCER_SOURCE_REVISION,
} from "./soccerPlayers.generated";
import { areSoccerTeammates } from "./soccerTeammates.generated";
import { soccerTeamMetadata } from "./soccerTeams";

export { SOCCER_SOURCE_REVISION };

const SOCCER_DATABASE_WITH_TEAMS = GENERATED_SOCCER_PLAYER_DATABASE.map((player) => {
  const team = soccerTeamMetadata(player.sourceTeamIds);
  return team ? { ...player, team: team.name, teamCode: team.code } : player;
});

export const SOCCER_PLAYER_DATABASE = SOCCER_DATABASE_WITH_TEAMS.map((player) => ({
  ...player,
  chemistryWith: SOCCER_DATABASE_WITH_TEAMS
    .filter((candidate) => areSoccerTeammates(player.sourceIdentity, candidate.sourceIdentity))
    .map((candidate) => candidate.id),
}));
