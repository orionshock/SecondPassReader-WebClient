import type { StagedSelectionNavigationIntent } from "../domain/ReaderBridge.Types";
import {
  debugStagedSelection,
  previewStagedSelectionCfi,
} from "./StagedSelectionDebug.Diagnostics";

export type StagedSelectionRelocationResult = {
  action: "preserved" | "canceled" | "ignored";
  shouldReanchor: boolean;
};

export class StagedSelectionLifecycle {
  private activeNavigationCount = 0;
  private protectedNavigationDepth = 0;
  private navigationEpoch = 0;
  private activeProtectedEpoch: number | null = null;
  private protectedOperationEpoch: number | null = null;

  constructor(private readonly actions: {
    cancelStagedSelection: () => void;
    hasStagedSelection: () => boolean;
    onUnrelatedNavigation: () => void;
  }) {}

  async runNavigation<T>(intent: StagedSelectionNavigationIntent, operation: () => Promise<T>): Promise<T> {
    const protectsTrailingRelocation = intent !== "unrelated";
    let protectedEpoch: number | null = null;

    debugStagedSelection("navigation begin", {
      intent,
      activeNavigationCount: this.activeNavigationCount,
      protectedNavigationDepth: this.protectedNavigationDepth,
      navigationEpoch: this.navigationEpoch,
      protectedOperationEpoch: this.protectedOperationEpoch,
    });

    if (intent === "unrelated") {
      this.navigationEpoch += 1;
      const invalidatedEpoch = this.protectedOperationEpoch;
      this.protectedOperationEpoch = null;
      debugStagedSelection("protection invalidated by explicit navigation", {
        navigationEpoch: this.navigationEpoch,
        invalidatedEpoch,
      });
      this.cancelForUnrelatedNavigation("unrelated-navigation-start");
    } else {
      if (this.protectedNavigationDepth === 0) {
        this.navigationEpoch += 1;
        this.activeProtectedEpoch = this.navigationEpoch;
        this.protectedOperationEpoch = this.activeProtectedEpoch;
        debugStagedSelection("operation-owned relocation protection armed", {
          intent,
          protectedEpoch: this.activeProtectedEpoch,
        });
      }
      this.protectedNavigationDepth += 1;
      protectedEpoch = this.activeProtectedEpoch;
    }

    this.activeNavigationCount += 1;
    try {
      return await operation();
    } finally {
      this.activeNavigationCount -= 1;
      if (protectsTrailingRelocation) {
        this.protectedNavigationDepth -= 1;
        if (this.protectedNavigationDepth === 0) {
          if (protectedEpoch !== null && this.navigationEpoch === protectedEpoch) {
            this.protectedOperationEpoch = protectedEpoch;
            debugStagedSelection("operation-owned relocation protection retained", {
              intent,
              protectedEpoch,
            });
          }
          this.activeProtectedEpoch = null;
        }
      }
      debugStagedSelection("navigation end", {
        intent,
        activeNavigationCount: this.activeNavigationCount,
        protectedNavigationDepth: this.protectedNavigationDepth,
        navigationEpoch: this.navigationEpoch,
        protectedOperationEpoch: this.protectedOperationEpoch,
      });
    }
  }

  handleLocationChanged(cfi?: string): StagedSelectionRelocationResult {
    if (this.activeNavigationCount > 0) {
      const shouldReanchor = this.protectedNavigationDepth > 0 && this.actions.hasStagedSelection();
      debugStagedSelection("relocation preserved during active navigation", {
        cfiPreview: previewStagedSelectionCfi(cfi),
        activeNavigationCount: this.activeNavigationCount,
        navigationEpoch: this.navigationEpoch,
        shouldReanchor,
      });
      if (shouldReanchor) this.logRelocationReanchorRequest(cfi, "active-protected-operation");
      return {
        action: this.protectedNavigationDepth > 0 ? "preserved" : "ignored",
        shouldReanchor,
      };
    }
    if (this.protectedOperationEpoch !== null) {
      const shouldReanchor = this.actions.hasStagedSelection();
      debugStagedSelection("relocation preserved by protected operation", {
        cfiPreview: previewStagedSelectionCfi(cfi),
        protectedEpoch: this.protectedOperationEpoch,
        shouldReanchor,
      });
      if (shouldReanchor) this.logRelocationReanchorRequest(cfi, "trailing-protected-operation");
      return { action: "preserved", shouldReanchor };
    }
    debugStagedSelection("unprotected relocation cancels staging", {
      cfiPreview: previewStagedSelectionCfi(cfi),
      navigationEpoch: this.navigationEpoch,
    });
    this.cancelForUnrelatedNavigation("unprotected-relocation");
    return { action: "canceled", shouldReanchor: false };
  }

  private logRelocationReanchorRequest(cfi: string | undefined, reason: string): void {
    debugStagedSelection("protected relocation requests toolbar reanchor", {
      cfiPreview: previewStagedSelectionCfi(cfi),
      reason,
      navigationEpoch: this.navigationEpoch,
      protectedOperationEpoch: this.protectedOperationEpoch,
    });
  }

  private cancelForUnrelatedNavigation(reason: string): void {
    debugStagedSelection("staged cancellation requested", { reason });
    this.actions.cancelStagedSelection();
    this.actions.onUnrelatedNavigation();
  }
}
