import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  OfflineReaderPendingSyncResult,
} from "../../../../app/offline/reader/sync/OfflineReaderPendingSync.Actions";
import type { OfflineReaderPendingSyncOutcome } from "../../../../app/offline/reader/sync/notice/OfflineReaderSyncOutcome.State";
import { presentOfflineReaderSyncNotice } from "../../../../app/offline/reader/sync/notice/OfflineReaderSyncNotice.Presenter";
import {
  dismissOfflineReaderSyncNotice,
  getOfflineReaderSyncNoticeSnapshot,
  showOfflineReaderSyncNotice,
  subscribeToOfflineReaderSyncNotice,
} from "../../../../app/offline/reader/sync/notice/OfflineReaderSyncNotice.State";
import { OfflineReaderSyncNoticePanel } from "../../../../app/offline/reader/sync/notice/OfflineReaderSyncNoticePanel.UI";

describe("offline Reader sync notice presentation", () => {
  it.each([
    ["normal success", { completedBooks: 2 }],
    ["cross-tab contention", { busyBooks: 2 }],
    ["transient retry", { retryLaterBooks: 1 }],
    ["authentication recovery", { reauthenticateBooks: 1 }],
    ["authority refresh", { refreshAuthorityBooks: 1 }],
  ])("keeps %s silent", (_name, outcome) => {
    expect(presentOfflineReaderSyncNotice(completed(outcome))).toBeNull();
  });

  it("presents forwarded edits as one informational continuation notice", () => {
    expect(presentOfflineReaderSyncNotice(completed({
      continuationBooks: 2,
      meaningfulOutcomeBooks: 2,
      forwardedConfirmedEdits: 3,
    }))).toMatchObject({
      kind: "continuation",
      severity: "info",
      forwardedEdits: 3,
      droppedDeletes: 0,
      terminalBooks: 0,
      affectedBooks: 2,
    });
  });

  it("combines forwarded edits, dropped deletes, and retained terminal work into one warning", () => {
    const notice = presentOfflineReaderSyncNotice(completed({
      continuationBooks: 2,
      meaningfulOutcomeBooks: 3,
      forwardedConfirmedEdits: 2,
      droppedConfirmedDeletes: 1,
      terminalBooks: 2,
    }));

    expect(notice).toMatchObject({
      kind: "continuation-and-terminal",
      severity: "warning",
      forwardedEdits: 2,
      droppedDeletes: 1,
      terminalBooks: 2,
      affectedBooks: 3,
    });
    expect(notice?.message).not.toContain("outbox");
    expect(notice?.message).not.toContain("SESSION_CLOSED");
  });

  it("warns without claiming terminal authored work was lost", () => {
    const notice = presentOfflineReaderSyncNotice(completed({ terminalBooks: 1, meaningfulOutcomeBooks: 1 }));

    expect(notice).toMatchObject({ kind: "terminal-pending", severity: "warning" });
    expect(notice?.message).not.toContain("lost");
  });
});

describe("offline Reader sync notice state", () => {
  afterEach(() => {
    const current = getOfflineReaderSyncNoticeSnapshot();
    if (current) dismissOfflineReaderSyncNotice(current.id);
  });

  it("notifies subscribers, replaces an older notice, and dismisses only the current notice", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToOfflineReaderSyncNotice(listener);
    const first = showOfflineReaderSyncNotice(notice("First"));
    const second = showOfflineReaderSyncNotice(notice("Second"));

    dismissOfflineReaderSyncNotice(first);
    expect(getOfflineReaderSyncNoticeSnapshot()).toMatchObject({ id: second, notice: { message: "Second" } });
    dismissOfflineReaderSyncNotice(second);
    expect(getOfflineReaderSyncNoticeSnapshot()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    showOfflineReaderSyncNotice(notice("After unsubscribe"));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("renders the current notice in a polite nonblocking app surface", () => {
    showOfflineReaderSyncNotice(notice("Reading changes were reconciled."));

    const html = renderToStaticMarkup(createElement(OfflineReaderSyncNoticePanel));

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Reading changes were reconciled.");
    expect(html).toContain("Dismiss");
  });
});

function completed(overrides: Partial<OfflineReaderPendingSyncOutcome> = {}): OfflineReaderPendingSyncResult {
  return {
    status: "completed",
    discoveredBooks: 2,
    attemptedBooks: 2,
    outcome: { ...emptyOutcome(), ...overrides },
  };
}

function emptyOutcome(): OfflineReaderPendingSyncOutcome {
  return {
    completedBooks: 0,
    partiallySyncedBooks: 0,
    busyBooks: 0,
    retryLaterBooks: 0,
    reauthenticateBooks: 0,
    refreshAuthorityBooks: 0,
    terminalBooks: 0,
    failedBooks: 0,
    continuationBooks: 0,
    meaningfulOutcomeBooks: 0,
    forwardedConfirmedEdits: 0,
    droppedConfirmedDeletes: 0,
    continuedLocalUpserts: 0,
  };
}

function notice(message: string) {
  return {
    kind: "continuation" as const,
    severity: "info" as const,
    message,
    forwardedEdits: 1,
    droppedDeletes: 0,
    terminalBooks: 0,
    affectedBooks: 1,
  };
}
