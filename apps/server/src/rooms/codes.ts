const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * Six characters from an unambiguous alphabet. Collision chance against a
 * few thousand open rooms is negligible; the unique index is the backstop.
 */
export function generateRoomCode(
  bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(6)),
): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[(bytes[i] as number) % ALPHABET.length]
  }
  return code
}
