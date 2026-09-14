import type {
  ReaderRendererCapability,
} from "../domain/ReaderBridge.Types";
import type { EpubTsBookEngine } from "../engine/EpubTsBook.Engine";
import { displayReaderCfiSafely } from "./ReaderCfiDisplay.Adapter";
import { probeReaderCfi } from "./ReaderCfiProbe.Adapter";
import type { ReaderBootstrapProgressGuard } from "./ReaderBootstrapProgressGuard.State";
import type { ReaderRuntimeController } from "./ReaderRuntime.Controller";
import type { StagedSelectionLifecycle } from "./StagedSelection.Lifecycle";

type ReaderCapabilityPublishers = {
  onRendererCapabilityReady: (capability: Omit<ReaderRendererCapability, "stagedSelection"> | null) => void;
};

export class ReaderCapabilityPublicationLifecycle {
  constructor(private readonly input: ReaderCapabilityPublishers & {
    bootstrapProgressGuard: ReaderBootstrapProgressGuard;
    runtimeController: ReaderRuntimeController;
    stagedSelectionLifecycle: StagedSelectionLifecycle;
  }) {}

  publish(engine: EpubTsBookEngine, generation: number, isCurrent: () => boolean): void {
    this.input.onRendererCapabilityReady({
      describeCfi: (cfi) => {
        if (!isCurrent()) return Promise.reject(new Error("Reader engine is not ready."));
        return engine.describeCfi(cfi);
      },
      probeCfi: (cfi) => {
        if (!isCurrent()) {
          return Promise.resolve({ ok: false, code: "unsupported", error: "Reader engine is not ready." });
        }
        return probeReaderCfi((candidate) => engine.probeCfi(candidate), cfi);
      },
      displayCfi: (cfi, options) => {
        if (!isCurrent()) {
          return Promise.resolve({ ok: false, code: "unsupported", error: "Reader engine is not ready." });
        }
        this.input.bootstrapProgressGuard.recordExplicitNavigation(generation);
        return displayReaderCfiSafely(
          (candidate) => this.input.runtimeController.run({
            kind: "safe-display",
            run: ({ engine: activeEngine }) => this.input.stagedSelectionLifecycle.runNavigation(
              options?.navigationIntent ?? "unrelated",
              () => activeEngine.displayCfiSafely(candidate),
            ),
          }),
          cfi,
        );
      },
      searchBook: (query, options) => {
        if (!isCurrent()) return Promise.reject(new Error("Reader engine is not ready."));
        return engine.searchBook(query, options);
      },
    });
  }

  unpublish(): void {
    this.input.onRendererCapabilityReady(null);
  }
}
