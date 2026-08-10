import { useCallback, useEffect, useRef, useState } from "react";
import type { ReaderSelection } from "../domain/ReaderDomain.Types";
import type { StagedSelectionToolbarPosition } from "../domain/ReaderBridge.Types";
import type { EpubTsBookEngine } from "../engine/EpubTsBook.Engine";
import {
  debugStagedSelection,
  previewStagedSelectionCfi,
} from "./ReaderStagedSelection.Diagnostics";
import {
  getStagedSelectionToolbarPosition,
  type StagedSelectionToolbarSize,
} from "./ReaderStagedToolbar.Placement";

type MutableRef<T> = { current: T };
type ReadRef<T> = { readonly current: T };

export function useReaderStagedSelectionReanchorController(input: {
  engineRef: MutableRef<EpubTsBookEngine | null>;
  mountWrapperRef: ReadRef<HTMLDivElement | null>;
  stagedSelectionRef: MutableRef<ReaderSelection | null>;
}) {
  const [toolbarPos, setToolbarPos] = useState<StagedSelectionToolbarPosition | null>(null);
  const toolbarPosRef = useRef<StagedSelectionToolbarPosition | null>(null);
  const toolbarAnchorRef = useRef<ReaderSelection["anchor"]>(undefined);
  const toolbarFallbackRef = useRef<StagedSelectionToolbarPosition | null>(null);
  const toolbarSizeRef = useRef<StagedSelectionToolbarSize | undefined>(undefined);
  const reanchorRequestRef = useRef(0);

  useEffect(() => {
    toolbarPosRef.current = toolbarPos;
  }, [toolbarPos]);

  const getFallbackToolbarPos = useCallback((): StagedSelectionToolbarPosition | null => {
    const wrapper = input.mountWrapperRef.current;
    if (!wrapper) return null;
    const bounds = wrapper.getBoundingClientRect();
    return { left: bounds.width / 2, top: 18, placement: "below" };
  }, [input.mountWrapperRef]);

  const getToolbarPosForAnchor = useCallback(
    (
      anchor?: ReaderSelection["anchor"],
      fallback?: StagedSelectionToolbarPosition | null,
    ): StagedSelectionToolbarPosition | null => {
      const wrapper = input.mountWrapperRef.current;
      if (!wrapper) return fallback ?? null;
      const viewport = {
        left: 0,
        top: 0,
        width: window.innerWidth || document.documentElement.clientWidth || wrapper.clientWidth,
        height: window.innerHeight || document.documentElement.clientHeight || wrapper.clientHeight,
      };
      return getStagedSelectionToolbarPosition({
        wrapper: wrapper.getBoundingClientRect(),
        anchor,
        fallback: fallback ?? getFallbackToolbarPos(),
        toolbarSize: toolbarSizeRef.current,
        viewport,
      });
    },
    [getFallbackToolbarPos, input.mountWrapperRef],
  );

  const resetStagedToolbar = useCallback(() => {
    toolbarAnchorRef.current = undefined;
    toolbarFallbackRef.current = null;
    reanchorRequestRef.current += 1;
    setToolbarPos(null);
  }, []);

  const positionStagedToolbar = useCallback((options: {
    anchor?: ReaderSelection["anchor"];
    toolbarPosition?: StagedSelectionToolbarPosition | null;
    deferToolbar?: boolean;
  }) => {
    toolbarAnchorRef.current = options.anchor;
    toolbarFallbackRef.current = options.toolbarPosition ?? getFallbackToolbarPos();
    reanchorRequestRef.current += 1;
    setToolbarPos(options.deferToolbar
      ? null
      : getToolbarPosForAnchor(options.anchor, toolbarFallbackRef.current));
  }, [getFallbackToolbarPos, getToolbarPosForAnchor]);

  const setStagedToolbarFallback = useCallback((toolbarPosition?: StagedSelectionToolbarPosition | null) => {
    toolbarFallbackRef.current = toolbarPosition ?? getFallbackToolbarPos();
  }, [getFallbackToolbarPos]);

  const reanchorStagedToolbar = useCallback(async () => {
    const selection = input.stagedSelectionRef.current;
    if (!selection?.cfiRange) return;
    const cfiRange = selection.cfiRange;
    const request = ++reanchorRequestRef.current;
    debugStagedSelection("toolbar reanchor start", {
      request,
      cfiPreview: previewStagedSelectionCfi(cfiRange),
    });
    await waitForNextPaint();
    if (!isStagedToolbarReanchorRequestCurrent(
      request,
      reanchorRequestRef.current,
      cfiRange,
      input.stagedSelectionRef.current?.cfiRange,
    )) {
      debugStagedSelection("toolbar reanchor abandoned before measurement", { request });
      return;
    }
    const anchor = await input.engineRef.current?.getVisibleCfiRangeAnchor(cfiRange) ?? null;
    if (!isStagedToolbarReanchorRequestCurrent(
      request,
      reanchorRequestRef.current,
      cfiRange,
      input.stagedSelectionRef.current?.cfiRange,
    )) {
      debugStagedSelection("toolbar reanchor abandoned after measurement", { request });
      return;
    }
    toolbarAnchorRef.current = anchor ?? undefined;
    const position = getToolbarPosForAnchor(
      anchor ?? undefined,
      toolbarFallbackRef.current ?? getFallbackToolbarPos(),
    );
    setToolbarPos(position);
    const wrapperBounds = input.mountWrapperRef.current?.getBoundingClientRect();
    debugStagedSelection("toolbar reanchor complete", {
      request,
      measuredAnchor: Boolean(anchor),
      anchorX: anchor?.x,
      anchorY: anchor?.y,
      anchorBottom: anchor?.bottom,
      toolbarLeft: position?.left,
      toolbarTop: position?.top,
      wrapperLeft: wrapperBounds?.left,
      wrapperTop: wrapperBounds?.top,
      wrapperWidth: wrapperBounds?.width,
      wrapperHeight: wrapperBounds?.height,
    });
  }, [
    getFallbackToolbarPos,
    getToolbarPosForAnchor,
    input.engineRef,
    input.mountWrapperRef,
    input.stagedSelectionRef,
  ]);

  const onToolbarSizeChange = useCallback((size: StagedSelectionToolbarSize) => {
    if (size.width <= 0 || size.height <= 0) return;
    if (toolbarSizeRef.current?.width === size.width && toolbarSizeRef.current.height === size.height) return;
    toolbarSizeRef.current = size;
    if (!input.stagedSelectionRef.current) return;
    setToolbarPos(getToolbarPosForAnchor(toolbarAnchorRef.current, toolbarFallbackRef.current));
  }, [getToolbarPosForAnchor, input.stagedSelectionRef]);

  return {
    toolbarPos,
    toolbarPosRef,
    resetStagedToolbar,
    positionStagedToolbar,
    setStagedToolbarFallback,
    reanchorStagedToolbar,
    onToolbarSizeChange,
  };
}

export function isStagedToolbarReanchorRequestCurrent(
  request: number,
  currentRequest: number,
  requestedCfiRange: string,
  currentCfiRange: string | undefined,
): boolean {
  return request === currentRequest && requestedCfiRange === currentCfiRange;
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}
