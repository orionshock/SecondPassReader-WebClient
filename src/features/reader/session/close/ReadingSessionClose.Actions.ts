import type { MarginaliaProgressInput, SecondPassClient } from "@secondpass/client";

export async function closeReadingSession(input: {
  spl?: SecondPassClient | null;
  sessionId: string | null;
  savedName: string | null;
  savedNotes: string | null;
  name: string;
  notes: string;
  finalProgress?: MarginaliaProgressInput;
}): Promise<void> {
  if (!input.spl) throw new Error("Not connected.");
  if (!input.sessionId) throw new Error("Missing session id.");

  const savedName = input.savedName?.trim() ?? "";
  const savedNotes = input.savedNotes ?? "";
  const payload: { name?: string; notes?: string } = {};
  if (input.name !== savedName) payload.name = input.name;
  if (input.notes !== savedNotes) payload.notes = input.notes;
  if (Object.keys(payload).length > 0) {
    await input.spl.marginalia.sessions.update(input.sessionId, payload);
  }
  await input.spl.marginalia.sessions.close(
    input.sessionId,
    input.finalProgress ? { progress: input.finalProgress } : undefined,
  );
}
