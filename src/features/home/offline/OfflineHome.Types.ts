import type { MarginaliaRecentSession, Shelf } from "@secondpass/client";

export type OfflineHomeRecentProjection = {
  items: MarginaliaRecentSession[];
};

export type OfflineHomeShelvesProjection = {
  items: Shelf[];
};
