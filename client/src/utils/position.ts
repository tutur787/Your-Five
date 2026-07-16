import { PlayerCard } from "@fiveaside/shared/core";

/** "PG", "PG/SG", or "PG/SG/SF" depending on how many real positions this player has listed. */
export function formatPosition(player: PlayerCard): string {
  if (player.sport === "soccer") {
    return [player.role, player.secondaryRole, player.tertiaryRole].filter(Boolean).join("/");
  }
  return [player.position, player.secondaryPosition, player.tertiaryPosition].filter(Boolean).join("/");
}
