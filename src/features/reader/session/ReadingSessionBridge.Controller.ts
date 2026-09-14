import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ReaderRendererCapability,
  StagedSelectionSource,
} from "../domain/ReaderBridge.Types";
import type { ReaderLocation, ReaderTocItem } from "../domain/ReaderDomain.Types";
import type {
  ReadingShellCommand,
  ReadingShellCommandValue,
  ReadingShellEvent,
} from "../shell/ReaderShell.Types";

export function useReadingSessionBridgeController(input: {
  activeBookKey: string;
  onStagedSelectionCommitted?: (source: StagedSelectionSource) => void;
  onStagedSelectionCanceled?: (source: StagedSelectionSource) => void;
}) {
  const [locationEntry, setLocationEntry] = useState<{ bookKey: string; location: ReaderLocation } | null>(null);
  const [progressLocationEntry, setProgressLocationEntry] = useState<{ bookKey: string; location: ReaderLocation } | null>(null);
  const [toc, setToc] = useState<ReaderTocItem[] | null>(null);
  const [pendingCommand, setPendingCommand] = useState<ReadingShellCommand | null>(null);
  const [rendererCapability, setRendererCapability] = useState<ReaderRendererCapability | null>(null);
  const [temporarySearchHighlightCfi, setTemporarySearchHighlightCfi] = useState<string | null>(null);
  const commandSeqRef = useRef(0);
  const lastActiveBookKeyRef = useRef(input.activeBookKey);

  const location = locationEntry?.bookKey === input.activeBookKey ? locationEntry.location : null;
  const progressLocation = progressLocationEntry?.bookKey === input.activeBookKey
    ? progressLocationEntry.location
    : null;

  useEffect(() => {
    if (lastActiveBookKeyRef.current === input.activeBookKey) return;
    lastActiveBookKeyRef.current = input.activeBookKey;
    setLocationEntry(null);
    setProgressLocationEntry(null);
    setToc(null);
    setPendingCommand(null);
    setRendererCapability(null);
    setTemporarySearchHighlightCfi(null);
  }, [input.activeBookKey]);

  const sendCommand = useCallback((command: ReadingShellCommandValue) => {
    commandSeqRef.current += 1;
    setPendingCommand({ seq: commandSeqRef.current, value: command });
  }, []);

  const jumpToSearchResult = useCallback(
    (cfi: string) => {
      const trimmed = cfi.trim();
      if (!trimmed) return;
      setTemporarySearchHighlightCfi(null);
      sendCommand({ type: "displaySearchResult", cfi: trimmed });
    },
    [sendCommand],
  );

  const jumpToCfi = useCallback(
    (cfi: string) => {
      const trimmed = cfi.trim();
      if (!trimmed) return;
      sendCommand({ type: "display", target: { type: "cfi", cfi: trimmed } });
    },
    [sendCommand],
  );

  const jumpToCfiRange = useCallback(
    (cfiRange: string) => {
      const trimmed = cfiRange.trim();
      if (!trimmed) return;
      sendCommand({ type: "display", target: { type: "cfiRange", cfiRange: trimmed } });
    },
    [sendCommand],
  );

  const clearTemporaryHighlight = useCallback(() => {
    setTemporarySearchHighlightCfi(null);
  }, []);

  useEffect(() => {
    if (!temporarySearchHighlightCfi) return;
    const id = window.setTimeout(() => setTemporarySearchHighlightCfi(null), 3500);
    return () => window.clearTimeout(id);
  }, [temporarySearchHighlightCfi]);

  const handleRendererCapabilityReady = useCallback((capability: ReaderRendererCapability | null) => {
    setRendererCapability(capability);
  }, []);

  const handleStagedSelectionCommitted = useCallback(
    (source: StagedSelectionSource) => {
      if (source.kind === "import") setTemporarySearchHighlightCfi(null);
      input.onStagedSelectionCommitted?.(source);
    },
    [input.onStagedSelectionCommitted],
  );

  const handleStagedSelectionCanceled = useCallback(
    (source: StagedSelectionSource) => {
      if (source.kind === "import") setTemporarySearchHighlightCfi(null);
      input.onStagedSelectionCanceled?.(source);
    },
    [input.onStagedSelectionCanceled],
  );

  const handleShellEvent = useCallback((event: ReadingShellEvent) => {
    switch (event.type) {
      case "locationChanged":
        setLocationEntry({ bookKey: input.activeBookKey, location: event.location });
        if (event.publishProgress) {
          setProgressLocationEntry({ bookKey: input.activeBookKey, location: event.location });
        }
        return;
      case "displayError":
        // eslint-disable-next-line no-console
        console.error("Reader error", event.error);
        return;
      case "tocReady":
        setToc(event.toc);
        return;
      case "locationsReady":
        return;
      case "navigate":
        sendCommand({ type: "display", target: event.target });
        return;
      case "searchResultDisplayed":
        setTemporarySearchHighlightCfi(event.cfi);
        return;
    }
  }, [input.activeBookKey, sendCommand]);

  return useMemo(() => ({
    location,
    progressLocation,
    toc,
    pendingCommand,
    rendererCapability,
    temporarySearchHighlightCfi,
    sendCommand,
    jumpToSearchResult,
    jumpToCfi,
    jumpToCfiRange,
    clearTemporaryHighlight,
    handleRendererCapabilityReady,
    handleStagedSelectionCommitted,
    handleStagedSelectionCanceled,
    handleShellEvent,
  }), [
    clearTemporaryHighlight,
    handleRendererCapabilityReady,
    handleStagedSelectionCanceled,
    handleStagedSelectionCommitted,
    jumpToCfi,
    jumpToCfiRange,
    jumpToSearchResult,
    location,
    handleShellEvent,
    pendingCommand,
    rendererCapability,
    progressLocation,
    sendCommand,
    temporarySearchHighlightCfi,
    toc,
  ]);
}
