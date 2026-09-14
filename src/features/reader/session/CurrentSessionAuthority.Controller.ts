import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MarginaliaAnnotation, MarginaliaProgress, SecondPassClient } from "@secondpass/client";
import type { OfflineReaderBootstrap } from "../Reader.Types";
import type { ReaderBookmark } from "../annotations/ReaderBookmark.Mapper";
import type { ReaderLocation, ReaderSelection, ReaderTocItem } from "../domain/ReaderDomain.Types";
import type { ReaderBookmarkMutationResult } from "./annotations/CurrentSessionBookmark.Actions";
import { useCurrentSessionAnnotationActions } from "./annotations/CurrentSessionAnnotation.Actions";
import { useOfflineCurrentSessionAnnotations } from "./annotations/OfflineCurrentSessionAnnotation.Lifecycle";
import { canWriteLocalReaderState } from "../../../app/offline/reader/continuity/OfflineReaderSession.Policy";
import { useReadingProgressAutosave } from "./progress/ReadingProgressAutosave.Lifecycle";
import { READING_PROGRESS_AUTOSAVE_DELAY_MS } from "./progress/ReadingProgressAutosave.Controller";
import { useOfflineReadingProgress } from "./progress/OfflineReadingProgress.Lifecycle";
import { buildReadingSessionAutosaveStatus } from "./progress/ReadingSessionProgress.Presenter";

export type CurrentSessionAnnotationCapability = {
  busy: boolean;
  toggleBookmarkAtCurrentLocation: () => Promise<ReaderBookmarkMutationResult>;
  createHighlight: (input: { selection: ReaderSelection; color: string; note?: string }) => Promise<void>;
  removeById: (annotationId: string) => Promise<void>;
  updateHighlight: (annotationId: string, update: { note: string; color: string }) => Promise<void>;
};

export type CurrentSessionAuthority =
  | {
      mode: "server";
      identity: string;
      status: "writable" | "read-only";
      writable: boolean;
      annotations: CurrentSessionAnnotationCapability | null;
      progress: { mode: "server"; status: string };
    }
  | {
      mode: "local";
      identity: string;
      status: "writable" | "initializing" | "read-only";
      writable: boolean;
      annotations: CurrentSessionAnnotationCapability | null;
      progress: { mode: "local"; status: string };
    }
  | {
      mode: "unavailable";
      identity: null;
      status: "missing-session";
      writable: false;
      annotations: null;
      progress: null;
    };

type AnnotationOwner = Omit<CurrentSessionAnnotationCapability, "busy"> & {
  busy?: boolean;
  canMutate?: boolean;
  annotationBusy?: boolean;
};

export function selectCurrentSessionAuthority(input: {
  serverSessionId: string | null;
  serverSessionWritable: boolean;
  serverProgressStatus: string;
  localBootstrap: OfflineReaderBootstrap | null;
  localProgressStatus: string;
  onlineAnnotations: AnnotationOwner;
  offlineAnnotations: AnnotationOwner & { canMutate: boolean; annotationBusy: boolean };
}): CurrentSessionAuthority {
  const localBootstrap = input.localBootstrap;
  if (localBootstrap) {
    const locallyWritable = canWriteLocalReaderState(localBootstrap.continuity.session);
    const writable = locallyWritable && input.offlineAnnotations.canMutate;
    return {
      mode: "local",
      identity: localBootstrap.continuity.session.localSessionId,
      status: writable ? "writable" : locallyWritable ? "initializing" : "read-only",
      writable,
      annotations: writable ? toAnnotationCapability(input.offlineAnnotations) : null,
      progress: { mode: "local", status: input.localProgressStatus },
    };
  }

  if (input.serverSessionId) {
    return {
      mode: "server",
      identity: input.serverSessionId,
      status: input.serverSessionWritable ? "writable" : "read-only",
      writable: input.serverSessionWritable,
      annotations: input.serverSessionWritable ? toAnnotationCapability(input.onlineAnnotations) : null,
      progress: { mode: "server", status: input.serverProgressStatus },
    };
  }

  return {
    mode: "unavailable",
    identity: null,
    status: "missing-session",
    writable: false,
    annotations: null,
    progress: null,
  };
}

function toAnnotationCapability(owner: AnnotationOwner): CurrentSessionAnnotationCapability {
  return {
    busy: owner.annotationBusy ?? owner.busy ?? false,
    toggleBookmarkAtCurrentLocation: owner.toggleBookmarkAtCurrentLocation,
    createHighlight: owner.createHighlight,
    removeById: owner.removeById,
    updateHighlight: owner.updateHighlight,
  };
}

export function useCurrentSessionAuthority(input: {
  activeBookKey: string;
  serverClient?: SecondPassClient | null;
  serverSessionId: string | null;
  serverSessionWritable: boolean;
  savedServerProgress?: MarginaliaProgress | null;
  localBootstrap: OfflineReaderBootstrap | null;
  location: ReaderLocation | null;
  toc: ReaderTocItem[] | null;
  bookTitle: string;
  locationLabel?: string;
  currentBookmark: ReaderBookmark | null;
  annotationsRaw: MarginaliaAnnotation[];
  setAnnotationsRaw: Dispatch<SetStateAction<MarginaliaAnnotation[]>>;
  setAnnotationError: (value: string | null) => void;
}) {
  const onlineProgress = useReadingProgressAutosave({
    enabled: input.serverSessionWritable,
    autosaveDelayMs: READING_PROGRESS_AUTOSAVE_DELAY_MS,
    spl: input.serverClient,
    sessionId: input.serverSessionId,
    location: input.location,
    toc: input.toc,
    bookTitle: input.bookTitle,
    savedProgress: input.savedServerProgress ?? null,
  });
  const offlineProgress = useOfflineReadingProgress({
    bootstrap: input.localBootstrap,
    location: input.location,
    toc: input.toc,
    bookTitle: input.bookTitle,
  });
  const onlineAnnotations = useCurrentSessionAnnotationActions({
    identity: `${input.activeBookKey}|${input.serverSessionId ?? ""}`,
    spl: input.serverClient,
    sessionId: input.serverSessionId,
    location: input.location,
    locationLabel: input.locationLabel,
    currentBookmark: input.currentBookmark,
    annotationsRaw: input.annotationsRaw,
    setAnnotationsRaw: input.setAnnotationsRaw,
    setAnnotationError: input.setAnnotationError,
    canMutate: input.serverSessionWritable,
  });
  const offlineAnnotations = useOfflineCurrentSessionAnnotations({
    bootstrap: input.localBootstrap,
    location: input.location,
    locationLabel: input.locationLabel,
    currentBookmark: input.currentBookmark,
    setAnnotationsRaw: input.setAnnotationsRaw,
    setAnnotationError: input.setAnnotationError,
  });

  const authority = useMemo(() => selectCurrentSessionAuthority({
    serverSessionId: input.serverSessionId,
    serverSessionWritable: input.serverSessionWritable,
    serverProgressStatus: onlineProgress.autosave.status,
    localBootstrap: input.localBootstrap,
    localProgressStatus: offlineProgress.status,
    onlineAnnotations,
    offlineAnnotations,
  }), [
    input.localBootstrap,
    input.serverSessionId,
    input.serverSessionWritable,
    offlineAnnotations.annotationBusy,
    offlineAnnotations.canMutate,
    offlineAnnotations.createHighlight,
    offlineAnnotations.removeById,
    offlineAnnotations.toggleBookmarkAtCurrentLocation,
    offlineAnnotations.updateHighlight,
    onlineAnnotations.annotationBusy,
    onlineAnnotations.createHighlight,
    onlineAnnotations.removeById,
    onlineAnnotations.toggleBookmarkAtCurrentLocation,
    onlineAnnotations.updateHighlight,
    offlineProgress.status,
    onlineProgress.autosave.status,
  ]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const shouldTick = Boolean(
    authority.mode === "server"
      && input.serverSessionId
      && onlineProgress.autosave.status !== "saving"
      && onlineProgress.autosave.status !== "saved"
      && typeof onlineProgress.autosave.nextSaveAt === "number"
      && onlineProgress.autosave.nextSaveAt > nowMs,
  );
  useEffect(() => {
    if (!shouldTick) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [shouldTick]);

  const autosaveStatus = useMemo((): { text: string; title?: string } | null => {
    if (input.localBootstrap) {
      return offlineProgress.status === "error" ? { text: "Offline progress not saved." } : null;
    }
    return buildReadingSessionAutosaveStatus({
      sessionId: input.serverSessionId,
      status: onlineProgress.autosave.status,
      lastSavedAt: onlineProgress.autosave.lastSavedAt,
      nextSaveAt: onlineProgress.autosave.nextSaveAt,
      nowMs,
    });
  }, [
    input.localBootstrap,
    input.serverSessionId,
    nowMs,
    offlineProgress.status,
    onlineProgress.autosave.lastSavedAt,
    onlineProgress.autosave.nextSaveAt,
    onlineProgress.autosave.status,
  ]);

  return {
    authority,
    autosaveStatus,
    prepareServerProgressForClose: onlineProgress.prepareProgressForClose,
    resumeServerProgressAfterCloseFailure: onlineProgress.resumeProgressAfterCloseFailure,
  };
}
