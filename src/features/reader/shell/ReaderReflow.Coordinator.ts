export async function stabilizeReaderReflow(input: {
  reflow: () => Promise<void>;
  refreshMarks: () => void;
  reanchorStagedToolbar: () => Promise<void>;
}): Promise<void> {
  await input.reflow();
  input.refreshMarks();
  try {
    // The staged-toolbar re-anchor owns its paint wait before measuring CFI geometry.
    await input.reanchorStagedToolbar();
  } catch {
    // Measurement is best-effort. Keep the staged selection and its fallback position.
  }
}
