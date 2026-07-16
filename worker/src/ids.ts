const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

/** Human-friendly room codes. Callers must reserve the corresponding Durable Object before
 * returning a code, because random generation alone cannot guarantee uniqueness. */
export function generateRoomCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(values, (value) => ROOM_CODE_CHARS[value % ROOM_CODE_CHARS.length]).join("");
}

/** Opaque seat-claim token used to restore the same seat after a reconnect. */
export function generateClaimToken(): string {
  return crypto.randomUUID();
}
