import type { StagedSelectionNavigationIntent } from "../domain/ReaderBridge.Types";
import {
  debugStagedSelection,
  previewStagedSelectionCfi,
} from "./StagedSelectionDebug.Diagnostics";

export class StagedSelectionLifecycle {
  private activeNavigationCount = 0;
  private protectedNavigationDepth = 0;
  private navigationEpoch = 0;
  private activeProtectedEpoch: number | null = null;
  private pendingProtectedRelocationEpoch: number | null = null;
  private protectedRelocationSettled = false;
  private protectedSettledCfi: string | null = null;

  constructor(private readonly actions: {
    cancelStagedSelection: () => void;
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
      pendingProtectedRelocationEpoch: this.pendingProtectedRelocationEpoch,
    });

    if (intent === "unrelated") {
      this.navigationEpoch += 1;
      const invalidatedEpoch = this.pendingProtectedRelocationEpoch;
      this.clearProtectedRelocationSettlement();
      debugStagedSelection("unrelated navigation invalidated protection", {
        navigationEpoch: this.navigationEpoch,
        invalidatedEpoch,
      });
      this.cancelForUnrelatedNavigation("unrelated-navigation-start");
    } else {
      if (this.protectedNavigationDepth === 0) {
        this.navigationEpoch += 1;
        this.activeProtectedEpoch = this.navigationEpoch;
        this.clearProtectedRelocationSettlement();
        debugStagedSelection("protected navigation token started", {
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
            this.pendingProtectedRelocationEpoch = protectedEpoch;
            this.protectedRelocationSettled = false;
            this.protectedSettledCfi = null;
            debugStagedSelection("trailing relocation protection armed", {
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
        pendingProtectedRelocationEpoch: this.pendingProtectedRelocationEpoch,
      });
    }
  }

  handleLocationChanged(cfi?: string): void {
    if (this.activeNavigationCount > 0) {
      debugStagedSelection("relocation preserved during active navigation", {
        cfiPreview: previewStagedSelectionCfi(cfi),
        activeNavigationCount: this.activeNavigationCount,
        navigationEpoch: this.navigationEpoch,
      });
      return;
    }
    if (this.pendingProtectedRelocationEpoch !== null) {
      const protectedEpoch = this.pendingProtectedRelocationEpoch;
      const normalizedCfi = normalizeRelocationCfi(cfi);
      if (!this.protectedRelocationSettled) {
        this.protectedRelocationSettled = true;
        this.protectedSettledCfi = normalizedCfi;
        debugStagedSelection("trailing relocation settlement established", {
          cfiPreview: previewStagedSelectionCfi(cfi),
          protectedEpoch,
        });
        return;
      }
      if (normalizedCfi === this.protectedSettledCfi) {
        debugStagedSelection("equivalent trailing relocation preserved", {
          cfiPreview: previewStagedSelectionCfi(cfi),
          protectedEpoch,
        });
        return;
      }
      debugStagedSelection("different relocation ended protection", {
        cfiPreview: previewStagedSelectionCfi(cfi),
        protectedEpoch,
        settledCfiPreview: previewStagedSelectionCfi(this.protectedSettledCfi),
      });
      this.clearProtectedRelocationSettlement();
    }
    debugStagedSelection("unprotected relocation cancels staging", {
      cfiPreview: previewStagedSelectionCfi(cfi),
      navigationEpoch: this.navigationEpoch,
    });
    this.cancelForUnrelatedNavigation("unprotected-relocation");
  }

  private cancelForUnrelatedNavigation(reason: string): void {
    debugStagedSelection("staged cancellation requested", { reason });
    this.actions.cancelStagedSelection();
    this.actions.onUnrelatedNavigation();
  }

  private clearProtectedRelocationSettlement(): void {
    this.pendingProtectedRelocationEpoch = null;
    this.protectedRelocationSettled = false;
    this.protectedSettledCfi = null;
  }
}

function normalizeRelocationCfi(value?: string): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}
