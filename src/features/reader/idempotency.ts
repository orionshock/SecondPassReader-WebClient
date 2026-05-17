function safeRandomString(bytes: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
  const out: string[] = [];

  // Prefer crypto.getRandomValues when available.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cryptoObj: any = (globalThis as any).crypto;
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint8Array(bytes);
    cryptoObj.getRandomValues(arr);
    for (const b of arr) out.push(alphabet[b % alphabet.length]);
    return out.join("");
  }

  // Fallback: Math.random (less strong, but acceptable for idempotency keys).
  for (let i = 0; i < bytes; i += 1) out.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
  return out.join("");
}

export function createIdempotencyKey(): string {
  // Prefer UUID v4 when present.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cryptoObj: any = (globalThis as any).crypto;
  const uuid = cryptoObj?.randomUUID?.();
  if (typeof uuid === "string" && uuid.length <= 128) return uuid;

  // Keep <= 128 chars, no whitespace/control characters.
  return `ann_${Date.now().toString(16)}_${safeRandomString(32)}`.slice(0, 128);
}

