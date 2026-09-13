import type { MarginaliaBookmarkUpsert, MarginaliaHighlightUpsert } from "@secondpass/client";

// Desired annotation content, independent of transport, renderer, and persistence lifecycle.
export type CurrentSessionAnnotationMutation =
  | { action: "upsert"; annotation: MarginaliaBookmarkUpsert | MarginaliaHighlightUpsert }
  | { action: "delete"; clientId: string };
