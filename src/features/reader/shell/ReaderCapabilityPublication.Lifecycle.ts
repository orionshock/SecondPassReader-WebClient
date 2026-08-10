import type {
  ReaderDescribeCfiHandle,
  ReaderDisplayCfiHandle,
  ReaderProbeCfiHandle,
  ReaderSearchBookHandle,
} from "../domain/ReaderBridge.Types";
import type { EpubTsBookEngine } from "../engine/EpubTsBookEngine";
import { displayReaderCfiSafely } from "./readerCfiDisplay";
import { probeReaderCfi } from "./readerCfiProbe";
import type { ReaderBootstrapProgressGuard } from "./ReaderBootstrapProgressGuard.State";
import type { ReaderRuntimeController } from "./ReaderRuntime.Controller";
import type { StagedSelectionLifecycle } from "./StagedSelection.Lifecycle";

type ReaderCapabilityPublishers = {
  onDescribeCfiReady?: (handle: ReaderDescribeCfiHandle | null) => void;
  onProbeCfiReady?: (handle: ReaderProbeCfiHandle | null) => void;
  onDisplayCfiReady?: (handle: ReaderDisplayCfiHandle | null) => void;
  onSearchReady?: (handle: ReaderSearchBookHandle | null) => void;
};

export class ReaderCapabilityPublicationLifecycle {
  constructor(private readonly input: ReaderCapabilityPublishers & {
    bootstrapProgressGuard: ReaderBootstrapProgressGuard;
    runtimeController: ReaderRuntimeController;
    stagedSelectionLifecycle: StagedSelectionLifecycle;
  }) {}

  publish(engine: EpubTsBookEngine, generation: number, isCurrent: () => boolean): void {
    this.input.onDescribeCfiReady?.((cfi) => {
      if (!isCurrent()) return Promise.reject(new Error("Reader engine is not ready."));
      return engine.describeCfi(cfi);
    });
    this.input.onProbeCfiReady?.((cfi) => {
      if (!isCurrent()) {
        return Promise.resolve({ ok: false, code: "unsupported", error: "Reader engine is not ready." });
      }
      return probeReaderCfi((candidate) => engine.probeCfi(candidate), cfi);
    });
    this.input.onDisplayCfiReady?.((cfi, options) => {
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
    });
    this.input.onSearchReady?.((query, options) => {
      if (!isCurrent()) return Promise.reject(new Error("Reader engine is not ready."));
      return engine.searchBook(query, options);
    });
  }

  unpublish(): void {
    this.input.onDescribeCfiReady?.(null);
    this.input.onProbeCfiReady?.(null);
    this.input.onDisplayCfiReady?.(null);
    this.input.onSearchReady?.(null);
  }
}
