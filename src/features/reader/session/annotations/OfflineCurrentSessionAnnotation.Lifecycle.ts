import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MarginaliaAnnotation } from "@secondpass/client";
import {
  openIndexedDbOfflineRepositories,
  type IndexedDbOfflineRepositories,
} from "../../../../app/offline/IndexedDbOfflineRepositories.Factory";
import type { OfflineReaderBootstrap } from "../../Reader.Types";
import type { ReaderBookmark } from "../../annotations/ReaderBookmark.Mapper";
import type { ReaderLocation, ReaderSelection } from "../../domain/ReaderDomain.Types";
import type { ReaderBookmarkMutationResult } from "./CurrentSessionBookmark.Actions";
import {
  OfflineCurrentSessionAnnotationController,
  type OfflineAnnotationPersistenceState,
} from "./OfflineCurrentSessionAnnotation.Controller";

type OfflineAnnotationRepositories = Pick<
  IndexedDbOfflineRepositories<Blob>,
  "readerState" | "readerOutbox" | "close"
>;

const openProductionRepositories = () => openIndexedDbOfflineRepositories<Blob>();

export function useOfflineCurrentSessionAnnotations(input: {
  bootstrap: OfflineReaderBootstrap | null;
  location: ReaderLocation | null;
  locationLabel?: string;
  currentBookmark: ReaderBookmark | null;
  setAnnotationsRaw: Dispatch<SetStateAction<MarginaliaAnnotation[]>>;
  setAnnotationError: (value: string | null) => void;
  openRepositories?: () => Promise<OfflineAnnotationRepositories>;
}) {
  const [persistence, setPersistence] = useState<OfflineAnnotationPersistenceState>({ status: "idle", dirty: false });
  const [ready, setReady] = useState(false);
  const controllerRef = useRef<OfflineCurrentSessionAnnotationController | null>(null);
  const locationRef = useRef(input.location);
  const locationLabelRef = useRef(input.locationLabel);
  const bookmarkRef = useRef(input.currentBookmark);
  const setAnnotationsRawRef = useRef(input.setAnnotationsRaw);
  const setAnnotationErrorRef = useRef(input.setAnnotationError);
  locationRef.current = input.location;
  locationLabelRef.current = input.locationLabel;
  bookmarkRef.current = input.currentBookmark;
  setAnnotationsRawRef.current = input.setAnnotationsRaw;
  setAnnotationErrorRef.current = input.setAnnotationError;

  const namespaceKey = input.bootstrap?.continuity.namespaceKey ?? null;
  const bookId = input.bootstrap?.continuity.bookId ?? null;
  const openRepositories = input.openRepositories ?? openProductionRepositories;

  useEffect(() => {
    const bootstrap = input.bootstrap;
    if (!bootstrap || !namespaceKey || !bookId) {
      controllerRef.current = null;
      setReady(false);
      return;
    }
    let cancelled = false;
    let repositories: OfflineAnnotationRepositories | null = null;
    let controller: OfflineCurrentSessionAnnotationController | null = null;
    void (async () => {
      try {
        repositories = await openRepositories();
        if (cancelled) {
          repositories.close();
          return;
        }
        controller = new OfflineCurrentSessionAnnotationController({
          initialState: bootstrap.continuity,
          stateRepository: repositories.readerState,
          outboxRepository: repositories.readerOutbox,
          onAnnotationsChange: (annotations) => {
            if (!cancelled) setAnnotationsRawRef.current(annotations);
          },
          onStateChange: (state) => {
            if (cancelled) return;
            setPersistence(state);
            setAnnotationErrorRef.current(state.status === "error" ? "Offline annotation changes were not saved." : null);
          },
        });
        controllerRef.current = controller;
        setReady(controller.canMutate());
      } catch {
        if (!cancelled) {
          setPersistence({ status: "error", dirty: false });
          setAnnotationErrorRef.current("Offline annotations are unavailable.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (controllerRef.current === controller) controllerRef.current = null;
      setReady(false);
      if (!controller || !repositories) return;
      void controller.flush().catch(() => undefined).finally(() => repositories?.close());
    };
  }, [bookId, input.bootstrap, namespaceKey, openRepositories]);

  const toggleBookmarkAtCurrentLocation = useCallback(async (): Promise<ReaderBookmarkMutationResult> => {
    const controller = controllerRef.current;
    if (!controller) return { ok: false, reason: "not-allowed" };
    return controller.toggleBookmark({
      location: locationRef.current,
      locationLabel: locationLabelRef.current,
      currentBookmark: bookmarkRef.current,
    });
  }, []);

  const createHighlight = useCallback(async (args: { selection: ReaderSelection; color: string; note?: string }) => {
    const controller = controllerRef.current;
    if (!controller) throw new Error("Offline annotations are unavailable.");
    await controller.createHighlight({ ...args, locationLabel: locationLabelRef.current });
  }, []);

  const updateHighlight = useCallback(async (annotationId: string, update: { note: string; color: string }) => {
    const controller = controllerRef.current;
    if (!controller) throw new Error("Offline annotations are unavailable.");
    await controller.updateHighlight(annotationId, update);
  }, []);

  const removeById = useCallback(async (annotationId: string) => {
    const controller = controllerRef.current;
    if (!controller) return;
    await controller.removeById(annotationId);
  }, []);

  return {
    canMutate: Boolean(input.bootstrap && ready),
    annotationBusy: persistence.status === "saving",
    toggleBookmarkAtCurrentLocation,
    createHighlight,
    updateHighlight,
    removeById,
  };
}
