type ReaderMountSize = {
  width: number;
  height: number;
};

export function observeReaderMountResize(
  element: Element,
  onResize: (size: ReaderMountSize) => void,
): () => void {
  if (typeof ResizeObserver === "undefined") return () => undefined;

  let frameId: number | null = null;
  let pendingSize: ReaderMountSize | null = null;
  let deliveredSize: ReaderMountSize | null = null;
  let disposed = false;

  const observer = new ResizeObserver((entries) => {
    if (disposed) return;
    const entry = entries.find((candidate) => candidate.target === element) ?? entries[0];
    if (!entry) return;
    const size = normalizeReaderMountSize(entry.contentRect);
    if (!size) return;
    pendingSize = size;
    if (frameId != null) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      if (disposed) return;
      const nextSize = pendingSize;
      pendingSize = null;
      if (!nextSize || sizesMatch(nextSize, deliveredSize)) return;
      deliveredSize = nextSize;
      onResize(nextSize);
    });
  });

  observer.observe(element);
  return () => {
    disposed = true;
    observer.disconnect();
    pendingSize = null;
    if (frameId != null) window.cancelAnimationFrame(frameId);
    frameId = null;
  };
}

function normalizeReaderMountSize(rect: Pick<DOMRectReadOnly, "width" | "height">): ReaderMountSize | null {
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  return width > 0 && height > 0 ? { width, height } : null;
}

function sizesMatch(left: ReaderMountSize, right: ReaderMountSize | null): boolean {
  return Boolean(right && left.width === right.width && left.height === right.height);
}
