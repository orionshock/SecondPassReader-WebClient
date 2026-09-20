/** Guard Web-authored durable anchors, not a replacement for server CFI validation. */
export function assertDurableReaderCfi(cfi: string): void {
  const value = cfi.trim();
  if (!value.startsWith("epubcfi(") || !value.endsWith(")")) {
    throw new Error("Durable Reader location must be an EPUB CFI.");
  }

  // Element IDs follow structural steps (/4[id]); text assertions follow offsets (:17[text]).
  const outsideAssertions = value.replace(/\[[^\]]*\]/g, "");
  if (/:[0-9]+\[/.test(value) || /[~@;]/.test(outsideAssertions)) {
    throw new Error("Durable Reader CFI contains an unsupported location assertion or offset.");
  }
}
