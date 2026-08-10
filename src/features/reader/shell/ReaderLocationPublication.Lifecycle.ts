import type { ReaderLocation } from "../domain/ReaderDomain.Types";
import type { ReadingShellEvent } from "./ReaderShell.Types";
import type { ReaderBootstrapProgressGuard } from "./ReaderBootstrapProgressGuard.State";
import type { StagedSelectionLifecycle } from "./StagedSelection.Lifecycle";

export function publishReaderLocation(input: {
  location: ReaderLocation;
  generation: number;
  bootstrapProgressGuard: ReaderBootstrapProgressGuard;
  stagedSelectionLifecycle: StagedSelectionLifecycle;
  recordReadableViewport: (generation: number) => void;
  closeDurableToolbar: () => void;
  publishEvent: (event: ReadingShellEvent) => void;
  reanchorStagedToolbar: () => Promise<void>;
}): void {
  input.recordReadableViewport(input.generation);
  input.closeDurableToolbar();
  const stagedRelocation = input.stagedSelectionLifecycle.handleLocationChanged(input.location.cfi);
  input.publishEvent({
    type: "locationChanged",
    location: input.location,
    publishProgress: input.bootstrapProgressGuard.shouldPublishRelocation(
      input.generation,
      input.location.cfi,
    ),
  });
  if (stagedRelocation.shouldReanchor) void input.reanchorStagedToolbar();
}
