export type ServerConfirmedOfflineReaderSession = {
  kind: "server-confirmed";
  localSessionId: string;
  serverSessionId: string;
  lastKnownServerStatus: "active" | "closed" | null;
};

export type ProvisionalOfflineReaderSession = {
  kind: "provisional";
  localSessionId: string;
  serverSessionId: null;
  lastKnownServerStatus: null;
};

export type OfflineReaderSession =
  | ServerConfirmedOfflineReaderSession
  | ProvisionalOfflineReaderSession;

export type OfflineReaderSessionSelection = {
  session: OfflineReaderSession;
  source: "confirmed-active" | "existing-provisional" | "created-provisional";
};

export function selectOfflineReaderSession(input: {
  existingSession?: OfflineReaderSession | null;
  generateLocalId?: () => string;
}): OfflineReaderSessionSelection {
  const existing = input.existingSession;
  if (existing?.kind === "server-confirmed" && existing.lastKnownServerStatus === "active") {
    return { session: existing, source: "confirmed-active" };
  }
  if (existing?.kind === "provisional") {
    return { session: existing, source: "existing-provisional" };
  }

  return {
    session: createProvisionalReaderSession(input.generateLocalId),
    source: "created-provisional",
  };
}

export function canWriteLocalReaderState(session: OfflineReaderSession): boolean {
  return session.kind === "provisional" || session.lastKnownServerStatus === "active";
}

export function isProvisionalReaderSession(
  session: OfflineReaderSession,
): session is ProvisionalOfflineReaderSession {
  return session.kind === "provisional";
}

function createProvisionalReaderSession(generateLocalId = generateBrowserLocalId): ProvisionalOfflineReaderSession {
  const generated = generateLocalId().trim();
  if (!generated) throw new Error("A provisional Reader session requires a local identity.");
  return {
    kind: "provisional",
    localSessionId: `local:${generated}`,
    serverSessionId: null,
    lastKnownServerStatus: null,
  };
}

function generateBrowserLocalId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (!randomUuid) throw new Error("Secure local identity generation is unavailable.");
  return randomUuid.call(globalThis.crypto);
}
