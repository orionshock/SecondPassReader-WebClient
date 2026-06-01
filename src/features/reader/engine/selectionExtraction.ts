type SelectionTextAndContext = {
  text: string;
  before: string;
  after: string;
  anchor?: { x: number; y: number };
};

function safeText(s: unknown): string {
  return typeof s === "string" ? s : "";
}

function prevTextNode(root: Node, from: Node): Text | null {
  const prevNode = (node: Node): Node | null => {
    if (node === root) return null;
    if (node.previousSibling) {
      let n: Node = node.previousSibling;
      while (n.lastChild) n = n.lastChild;
      return n;
    }
    return node.parentNode;
  };

  let n: Node | null = from;
  while (n) {
    n = prevNode(n);
    if (!n) return null;
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as Text;
      if (t.data) return t;
    }
  }
  return null;
}

function nextTextNode(root: Node, from: Node): Text | null {
  const nextNode = (node: Node): Node | null => {
    if (node === root) return null;
    if (node.nextSibling) {
      let n: Node = node.nextSibling;
      while (n.firstChild) n = n.firstChild;
      return n;
    }
    return node.parentNode;
  };

  let n: Node | null = from;
  while (n) {
    n = nextNode(n);
    if (!n) return null;
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as Text;
      if (t.data) return t;
    }
  }
  return null;
}

function extractRangeContext(range: Range, doc: Document): { before: string; after: string } {
  const root: Node = doc.body ?? doc.documentElement ?? doc;
  const MAX_CONTEXT = 2000;

  const beforeParts: string[] = [];
  const afterParts: string[] = [];

  const startNode = range.startContainer;
  if (startNode.nodeType === Node.TEXT_NODE) {
    beforeParts.push(safeText((startNode as Text).data).slice(0, range.startOffset));
  }
  let prev = prevTextNode(root, startNode);
  while (prev && beforeParts.join("").length < MAX_CONTEXT) {
    beforeParts.unshift(safeText(prev.data));
    prev = prevTextNode(root, prev);
  }
  let before = beforeParts.join("");
  if (before.length > MAX_CONTEXT) before = before.slice(before.length - MAX_CONTEXT);

  const endNode = range.endContainer;
  if (endNode.nodeType === Node.TEXT_NODE) {
    afterParts.push(safeText((endNode as Text).data).slice(range.endOffset));
  }
  let next = nextTextNode(root, endNode);
  while (next && afterParts.join("").length < MAX_CONTEXT) {
    afterParts.push(safeText(next.data));
    next = nextTextNode(root, next);
  }
  let after = afterParts.join("");
  if (after.length > MAX_CONTEXT) after = after.slice(0, MAX_CONTEXT);

  return { before, after };
}

export function extractSelectionTextAndContext(contents: { window: Window; document: Document }): SelectionTextAndContext | null {
  const sel = contents.window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  const text = safeText(sel.toString()).trim();
  if (!text) return null;

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect?.();
  const anchor = (() => {
    try {
      if (!rect) return undefined;
      const frameEl = contents.window.frameElement as HTMLElement | null;
      if (!frameEl) return undefined;
      const frameRect = frameEl.getBoundingClientRect();
      const x = frameRect.left + rect.left + rect.width / 2;
      const y = frameRect.top + rect.top;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
      return { x, y };
    } catch {
      return undefined;
    }
  })();

  // Best-effort context extraction. Avoid relying on `textContent.indexOf(text)` because
  // selections often span multiple nodes and whitespace normalization can differ.
  const startNode = range.startContainer;
  const endNode = range.endContainer;

  if (startNode === endNode && startNode.nodeType === Node.TEXT_NODE) {
    const full = safeText((startNode as Text).data);
    const before = full.slice(0, range.startOffset);
    const after = full.slice(range.endOffset);
    return { text, before, after, anchor };
  }

  const { before, after } = extractRangeContext(range, contents.document);
  return { text, before, after, anchor };
}

