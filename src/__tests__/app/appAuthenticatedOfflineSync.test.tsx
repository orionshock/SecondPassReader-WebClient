// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SecondPassClient } from "@secondpass/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppAuthenticatedOfflineSyncLifecycle } from "../../app/AppAuthenticatedOfflineSync.Lifecycle";
import {
  createOfflineReaderAuthenticatedSyncGeneration,
  startOfflineReaderAuthenticatedSyncLifecycle,
} from "../../app/offline/reader/sync/OfflineReaderAuthenticatedSync.Lifecycle";
import { clearOfflineReaderSyncNotice } from "../../app/offline/reader/sync/notice/OfflineReaderSyncNotice.State";
import { createOfflineReaderSyncOutcome } from "../../app/offline/reader/sync/notice/OfflineReaderSyncOutcome.State";
import type { AppWorkflowStep } from "../../app/AppWorkflow.Policy";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";

vi.mock("../../app/offline/reader/sync/OfflineReaderAuthenticatedSync.Lifecycle", () => ({
  createOfflineReaderAuthenticatedSyncGeneration: vi.fn(() => ({ active: false, startupDecided: false })),
  startOfflineReaderAuthenticatedSyncLifecycle: vi.fn(() => vi.fn()),
}));
vi.mock("../../app/offline/reader/sync/notice/OfflineReaderSyncNotice.State", () => ({
  clearOfflineReaderSyncNotice: vi.fn(),
}));
vi.mock("../../app/offline/reader/sync/notice/OfflineReaderSyncNotice.Controller", () => ({
  showOfflineReaderSyncOutcome: vi.fn(),
}));

const createGenerationMock = vi.mocked(createOfflineReaderAuthenticatedSyncGeneration);
const startSyncMock = vi.mocked(startOfflineReaderAuthenticatedSyncLifecycle);
const clearNoticeMock = vi.mocked(clearOfflineReaderSyncNotice);

describe("App authenticated offline sync lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;
  const requireAuthenticationRepair = vi.fn();
  const spl = {} as SecondPassClient;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("starts only for a verified authenticated namespace", () => {
    act(() => root.render(<Harness workflowStep="library_home" profile={profile("connection-a", "profile-a")} spl={spl} />));

    expect(startSyncMock).toHaveBeenCalledOnce();
    expect(startSyncMock.mock.calls[0][0]).toMatchObject({
      namespaceKey: "server:https%3A%2F%2Flibrary.example|profile:profile-a",
      client: spl,
    });
    expect(clearNoticeMock).toHaveBeenCalledOnce();
  });

  it("requests repair when a completed sweep reports reauthentication work", () => {
    act(() => root.render(<Harness workflowStep="library_home" profile={profile("connection-a", "profile-a")} spl={spl} />));

    const onSweepCompleted = startSyncMock.mock.calls[0][0].onSweepCompleted;
    act(() => onSweepCompleted?.({
      status: "completed",
      discoveredBooks: 1,
      attemptedBooks: 1,
      outcome: {
        ...createOfflineReaderSyncOutcome(),
        reauthenticateBooks: 1,
      },
    }));

    expect(requireAuthenticationRepair).toHaveBeenCalledOnce();
  });

  it("does not run while authentication repair owns the workflow", () => {
    act(() => root.render(<Harness workflowStep="pair_device" profile={profile("connection-a", "profile-a")} spl={null} />));

    expect(startSyncMock).not.toHaveBeenCalled();
  });

  it("stops, resets notice scope, and creates a generation when authenticated identity changes", () => {
    const stopFirst = vi.fn();
    const stopSecond = vi.fn();
    startSyncMock.mockReturnValueOnce(stopFirst).mockReturnValueOnce(stopSecond);

    act(() => root.render(<Harness workflowStep="library_home" profile={profile("connection-a", "profile-a")} spl={spl} />));
    act(() => root.render(<Harness workflowStep="library_home" profile={profile("connection-b", "profile-b")} spl={spl} />));

    expect(stopFirst).toHaveBeenCalledOnce();
    expect(startSyncMock).toHaveBeenCalledTimes(2);
    expect(createGenerationMock).toHaveBeenCalledTimes(2);
    expect(clearNoticeMock).toHaveBeenCalledTimes(2);

    act(() => root.render(<Harness workflowStep="library_home" profile={profile("connection-b", "profile-b")} spl={spl} />));
    expect(startSyncMock).toHaveBeenCalledTimes(2);
    expect(clearNoticeMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates the sync generation when repaired credentials replace the token", () => {
    const stopFirst = vi.fn();
    startSyncMock.mockReturnValueOnce(stopFirst).mockReturnValueOnce(vi.fn());

    act(() => root.render(
      <Harness workflowStep="library_home" profile={profile("connection-a", "profile-a", "old-token")} spl={spl} />,
    ));
    act(() => root.render(
      <Harness workflowStep="library_home" profile={profile("connection-a", "profile-a", "repaired-token")} spl={spl} />,
    ));

    expect(stopFirst).toHaveBeenCalledOnce();
    expect(createGenerationMock).toHaveBeenCalledTimes(2);
    expect(startSyncMock).toHaveBeenCalledTimes(2);
  });

  function Harness({
    workflowStep,
    profile: selectedProfile,
    spl: client,
  }: {
    workflowStep: AppWorkflowStep;
    profile: ConnectionProfile | null;
    spl: SecondPassClient | null;
  }) {
    useAppAuthenticatedOfflineSyncLifecycle({
      workflowStep,
      profile: selectedProfile,
      spl: client,
      requireAuthenticationRepair,
    });
    return null;
  }
});

function profile(id: string, profileId: string, accessToken = "token"): ConnectionProfile {
  return {
    id,
    label: "Library",
    serverBaseUrl: "https://library.example",
    apiBaseUrl: "https://library.example/api/v1",
    accessToken,
    verifiedAt: "2026-09-13T00:00:00.000Z",
    verifiedUser: { profileId, username: "reader" },
    createdAt: "2026-09-13T00:00:00.000Z",
  };
}
