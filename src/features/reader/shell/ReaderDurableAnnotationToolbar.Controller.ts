import { useCallback, useEffect, useRef, useState } from "react";
import type { HighlightMarkClick } from "../engine/highlightMarks";
import type {
  DurableAnnotationToolbarItem,
  DurableAnnotationToolbarPosition,
} from "./DurableAnnotationToolbar";

type DurableToolbarState = {
  annotationId: string;
  position: DurableAnnotationToolbarPosition;
};

export type ReaderDurableAnnotationToolbarRenderProps = {
  item: DurableAnnotationToolbarItem;
  position: DurableAnnotationToolbarPosition;
  busy?: boolean;
  theme?: string;
  onSave: (update: { note: string; color: string }) => Promise<void>;
  onDelete: () => void;
  onOpenWorkspace: () => void;
  onClose: () => void;
};

export type ReaderDurableAnnotationToolbarController = {
  closeToolbar: () => void;
  onEngineHighlightClick: (click: HighlightMarkClick) => void;
  toolbarProps: ReaderDurableAnnotationToolbarRenderProps | null;
};

export function useReaderDurableAnnotationToolbarController(input: {
  items?: DurableAnnotationToolbarItem[];
  busy?: boolean;
  theme?: string;
  cancelStagedSelection: () => void;
  onUpdateHighlight?: (annotationId: string, update: { note: string; color: string }) => Promise<void>;
  onRemoveAnnotation?: (annotationId: string) => Promise<void>;
  onOpenAnnotationInWorkspace?: (annotationId: string, mode: "editable" | "readonly") => void;
}): ReaderDurableAnnotationToolbarController {
  const {
    busy,
    cancelStagedSelection,
    items,
    onOpenAnnotationInWorkspace,
    onRemoveAnnotation,
    onUpdateHighlight,
    theme,
  } = input;
  const [toolbar, setToolbar] = useState<DurableToolbarState | null>(null);
  const itemsRef = useRef<DurableAnnotationToolbarItem[]>(items ?? []);
  useEffect(() => {
    itemsRef.current = items ?? [];
  }, [items]);

  const closeToolbar = useCallback(() => {
    setToolbar(null);
  }, []);

  const toToolbarPosition = useCallback((anchor?: HighlightMarkClick): DurableAnnotationToolbarPosition => {
    const margin = 12;
    const width = window.innerWidth || document.documentElement.clientWidth || 1;
    const height = window.innerHeight || document.documentElement.clientHeight || 1;
    const toolbarWidth = Math.min(340, Math.max(220, width - margin * 2));
    const toolbarHeight = 160;
    const leftRaw = typeof anchor?.clientX === "number" ? anchor.clientX : width / 2;
    const topRaw = typeof anchor?.clientY === "number" ? anchor.clientY : height / 2;
    const preferredPlacement = chooseClickToolbarPlacement({
      clickX: leftRaw,
      clickY: topRaw,
      height,
      margin,
      toolbarHeight,
      toolbarWidth,
      width,
    });
    return clampClickToolbarPosition({
      clickX: leftRaw,
      clickY: topRaw,
      height,
      margin,
      placement: preferredPlacement,
      toolbarHeight,
      toolbarWidth,
      width,
    });
  }, []);

  const onEngineHighlightClick = useCallback((click: HighlightMarkClick) => {
    const annotationId = click.annotationId.trim();
    if (!annotationId) return;
    const item = itemsRef.current.find((candidate) => candidate.id === annotationId);
    if (!item) return;
    const position = toToolbarPosition(click);
    cancelStagedSelection();
    setToolbar({ annotationId, position });
  }, [cancelStagedSelection, toToolbarPosition]);

  useEffect(() => {
    if (!toolbar) return;
    if (items?.some((item) => item.id === toolbar.annotationId)) return;
    setToolbar(null);
  }, [items, toolbar]);

  useEffect(() => {
    if (!toolbar) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeToolbar();
    };
    const onPointerDown = () => closeToolbar();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closeToolbar, toolbar]);

  const toolbarItem = toolbar && items
    ? items.find((item) => item.id === toolbar.annotationId) ?? null
    : null;
  const toolbarProps: ReaderDurableAnnotationToolbarRenderProps | null = toolbar && toolbarItem
    ? {
        item: toolbarItem,
        position: toolbar.position,
        busy,
        theme,
        onSave: (update) => {
          if (toolbarItem.mode !== "editable" || !onUpdateHighlight) return Promise.resolve();
          return onUpdateHighlight(toolbarItem.id, update);
        },
        onDelete: () => {
          if (toolbarItem.mode !== "editable" || !onRemoveAnnotation) return;
          if (!window.confirm("Delete this annotation?")) return;
          const annotationId = toolbarItem.id;
          closeToolbar();
          void onRemoveAnnotation(annotationId);
        },
        onOpenWorkspace: () => {
          onOpenAnnotationInWorkspace?.(toolbarItem.id, toolbarItem.mode);
          closeToolbar();
        },
        onClose: closeToolbar,
      }
    : null;

  return {
    closeToolbar,
    onEngineHighlightClick,
    toolbarProps,
  };
}

function chooseClickToolbarPlacement({
  clickX,
  clickY,
  height,
  margin,
  toolbarHeight,
  toolbarWidth,
  width,
}: {
  clickX: number;
  clickY: number;
  height: number;
  margin: number;
  toolbarHeight: number;
  toolbarWidth: number;
  width: number;
}): DurableAnnotationToolbarPosition["placement"] {
  const fitsRight = clickX + toolbarWidth <= width - margin;
  const fitsLeft = clickX - toolbarWidth >= margin;
  if (clickX < width / 2 && fitsRight) return "right";
  if (clickX >= width / 2 && fitsLeft) return "left";
  if (fitsRight) return "right";
  if (fitsLeft) return "left";

  const fitsBelow = clickY + toolbarHeight <= height - margin;
  const fitsAbove = clickY - toolbarHeight >= margin;
  if (clickY < height / 2 && fitsBelow) return "below";
  if (fitsAbove) return "above";
  return fitsBelow ? "below" : "above";
}

function clampClickToolbarPosition({
  clickX,
  clickY,
  height,
  margin,
  placement,
  toolbarHeight,
  toolbarWidth,
  width,
}: {
  clickX: number;
  clickY: number;
  height: number;
  margin: number;
  placement: DurableAnnotationToolbarPosition["placement"];
  toolbarHeight: number;
  toolbarWidth: number;
  width: number;
}): DurableAnnotationToolbarPosition {
  if (placement === "left" || placement === "right") {
    return {
      left: placement === "left" ? Math.max(toolbarWidth + margin, clickX) : Math.min(width - toolbarWidth - margin, clickX),
      top: clamp(clickY, margin + toolbarHeight / 2, height - margin - toolbarHeight / 2),
      placement,
    };
  }

  return {
    left: clamp(clickX, margin + toolbarWidth / 2, width - margin - toolbarWidth / 2),
    top: placement === "above" ? Math.max(toolbarHeight + margin, clickY) : Math.min(height - toolbarHeight - margin, clickY),
    placement,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
