/** Secure UUID v4 without requiring secure-context-only crypto.randomUUID(). */
export function randomId(): string {
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues)
    throw new Error(
      'This WebView cannot create secure session IDs. Update its browser engine.',
    );
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
