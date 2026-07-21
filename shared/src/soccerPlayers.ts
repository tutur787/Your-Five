import {
  SOCCER_PLAYER_DATABASE as GENERATED_SOCCER_PLAYER_DATABASE,
  SOCCER_SOURCE_REVISION,
} from "./soccerPlayers.generated";
import { soccerTeamMetadata } from "./soccerTeams";

export { SOCCER_SOURCE_REVISION };

export const SOCCER_PLAYER_DATABASE = GENERATED_SOCCER_PLAYER_DATABASE.map((player) => {
  const team = soccerTeamMetadata(player.sourceTeamIds);
  return team ? { ...player, team: team.name, teamCode: team.code } : player;
});
