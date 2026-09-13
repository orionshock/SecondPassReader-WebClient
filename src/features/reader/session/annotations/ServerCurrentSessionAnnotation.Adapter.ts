import type { SecondPassClient } from "@secondpass/client";
import type { CurrentSessionAnnotationMutation } from "./CurrentSessionAnnotation.Types";

// Called inside the current-session serialization/generation controller, never by replay.
export function commitServerCurrentSessionAnnotation(
  client: SecondPassClient,
  sessionId: string | null,
  mutation: CurrentSessionAnnotationMutation,
) {
  if (!sessionId?.trim() || sessionId.startsWith("local:")) throw new Error("Missing server Reading Session authority.");
  const clientId = mutation.action === "upsert" ? mutation.annotation.clientId : mutation.clientId;
  if (!clientId.trim()) throw new Error("Annotation client identity is unavailable.");
  return client.marginalia.sessions.batchAnnotations(sessionId, [mutation]);
}
