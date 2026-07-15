import { PlayerCard } from "@fiveaside/shared";

/** "PG", "PG/SG", or "PG/SG/SF" depending on how many real positions this player has listed. */
export function formatPosition(player: PlayerCard): string {
  return [player.position, player.secondaryPosition, player.tertiaryPosition].filter(Boolean).join("/");
}
