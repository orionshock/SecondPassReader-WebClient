import type { OfflineReaderSyncNotice } from "./OfflineReaderSyncNotice.Presenter";

export type OfflineReaderSyncNoticeSnapshot = {
  id: number;
  notice: OfflineReaderSyncNotice;
} | null;

const listeners = new Set<() => void>();
let nextId = 1;
let snapshot: OfflineReaderSyncNoticeSnapshot = null;

export function getOfflineReaderSyncNoticeSnapshot(): OfflineReaderSyncNoticeSnapshot {
  return snapshot;
}

export function subscribeToOfflineReaderSyncNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showOfflineReaderSyncNotice(notice: OfflineReaderSyncNotice): number {
  const id = nextId;
  nextId += 1;
  snapshot = { id, notice };
  notify();
  return id;
}

export function dismissOfflineReaderSyncNotice(id: number): void {
  if (snapshot?.id !== id) return;
  clearOfflineReaderSyncNotice();
}

export function clearOfflineReaderSyncNotice(): void {
  if (!snapshot) return;
  snapshot = null;
  notify();
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}
