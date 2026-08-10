import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ReaderDescribeCfiHandle,
  ReaderDisplayCfiHandle,
  ReaderProbeCfiHandle,
  ReaderSearchBookHandle,
  StagedSelectionHandle,
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
  const [searchBook, setSearchBook] = useState<ReaderSearchBookHandle | null>(null);
  const [probeCfi, setProbeCfi] = useState<ReaderProbeCfiHandle | null>(null);
  const [displayCfi, setDisplayCfi] = useState<ReaderDisplayCfiHandle | null>(null);
  const [stagedSelectionHandle, setStagedSelectionHandle] = useState<StagedSelectionHandle | null>(null);
  const [describeCfi, setDescribeCfi] = useState<ReaderDescribeCfiHandle | null>(null);
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
    setSearchBook(null);
    setProbeCfi(null);
    setDisplayCfi(null);
    setStagedSelectionHandle(null);
    setDescribeCfi(null);
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

  const handleSearchReady = useCallback((handle: ReaderSearchBookHandle | null) => {
    setSearchBook(() => handle);
  }, []);

  const handleProbeCfiReady = useCallback((handle: ReaderProbeCfiHandle | null) => {
    setProbeCfi(() => handle);
  }, []);

  const handleDisplayCfiReady = useCallback((handle: ReaderDisplayCfiHandle | null) => {
    setDisplayCfi(() => handle);
  }, []);

  const handleStagedSelectionReady = useCallback((handle: StagedSelectionHandle | null) => {
    setStagedSelectionHandle(handle);
  }, []);

  const handleDescribeCfiReady = useCallback(
    (handle: ReaderDescribeCfiHandle | null) => {
      setDescribeCfi(() => handle);
    },
    [],
  );

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
    searchBook,
    probeCfi,
    displayCfi,
    stagedSelectionHandle,
    describeCfi,
    temporarySearchHighlightCfi,
    sendCommand,
    jumpToSearchResult,
    jumpToCfi,
    jumpToCfiRange,
    clearTemporaryHighlight,
    handleSearchReady,
    handleProbeCfiReady,
    handleDisplayCfiReady,
    handleStagedSelectionReady,
    handleDescribeCfiReady,
    handleStagedSelectionCommitted,
    handleStagedSelectionCanceled,
    handleShellEvent,
  }), [
    clearTemporaryHighlight,
    describeCfi,
    displayCfi,
    handleDescribeCfiReady,
    handleDisplayCfiReady,
    handleProbeCfiReady,
    handleSearchReady,
    handleStagedSelectionCanceled,
    handleStagedSelectionCommitted,
    handleStagedSelectionReady,
    jumpToCfi,
    jumpToCfiRange,
    jumpToSearchResult,
    location,
    handleShellEvent,
    pendingCommand,
    probeCfi,
    progressLocation,
    searchBook,
    sendCommand,
    stagedSelectionHandle,
    temporarySearchHighlightCfi,
    toc,
  ]);
}
