// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ApiError, type CurrentUser, type SecondPassClient, type ServerInfo } from "@secondpass/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppAuthenticatedContextController } from "../../app/AppAuthenticatedContext.Controller";
import {
  clearActiveConnection,
  getActiveConnection,
  saveConnectionProfile,
  type ConnectionProfile,
} from "../../storage/ConnectionProfiles.Store";

describe("authenticated context publication ownership", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    clearActiveConnection();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("does not restore a removed connection after a late refresh success", async () => {
    const connection = profile("connection-a", "token-a");
    const user = deferred<CurrentUser>();
    const callbacks = render(connection, client(user.promise));
    await vi.waitFor(() => expect(callbacks.getCurrentUser).toHaveBeenCalledOnce());

    clearActiveConnection();
    user.resolve(currentUser("profile-a"));
    await act(async () => user.promise);

    expect(getActiveConnection()).toBeNull();
    expect(callbacks.clearAuthorizationFailure).not.toHaveBeenCalled();
    expect(callbacks.onProfileChanged).not.toHaveBeenCalled();
  });

  it("does not report a stale failure against a replacement connection", async () => {
    const connection = profile("connection-a", "token-a");
    const user = deferred<CurrentUser>();
    const callbacks = render(connection, client(user.promise));
    await vi.waitFor(() => expect(callbacks.getCurrentUser).toHaveBeenCalledOnce());
    const replacement = profile("connection-b", "token-b");

    saveConnectionProfile(replacement);
    user.reject(new ApiError({ kind: "unauthorized", status: 401, message: "Rejected" }));
    await act(async () => user.promise.catch(() => undefined));

    expect(getActiveConnection()).toEqual(replacement);
    expect(callbacks.reportAuthorizationFailure).not.toHaveBeenCalled();
  });

  it("keeps repaired credentials authoritative when a pre-repair refresh finishes late", async () => {
    const connection = profile("connection-a", "old-token");
    const user = deferred<CurrentUser>();
    const callbacks = render(connection, client(user.promise));
    await vi.waitFor(() => expect(callbacks.getCurrentUser).toHaveBeenCalledOnce());
    const repaired = { ...connection, accessToken: "repaired-token" };

    saveConnectionProfile(repaired);
    user.resolve(currentUser("profile-a"));
    await act(async () => user.promise);

    expect(getActiveConnection()).toEqual(repaired);
    expect(callbacks.clearAuthorizationFailure).not.toHaveBeenCalled();
    expect(callbacks.onProfileChanged).not.toHaveBeenCalled();
  });

  it("still publishes current success and current authorization failure", async () => {
    const success = profile("connection-a", "token-a");
    const successCallbacks = render(success, client(Promise.resolve(currentUser("profile-a"))));
    await vi.waitFor(() => expect(successCallbacks.onProfileChanged).toHaveBeenCalledOnce());
    expect(successCallbacks.clearAuthorizationFailure).toHaveBeenCalledOnce();
    expect(getActiveConnection()?.verifiedUser?.profileId).toBe("profile-a");

    act(() => root.unmount());
    root = createRoot(container);
    const failed = getActiveConnection()!;
    const failure = new ApiError({ kind: "unauthorized", status: 401, message: "Rejected" });
    const failureCallbacks = render(failed, client(Promise.reject(failure)));
    await vi.waitFor(() => expect(failureCallbacks.reportAuthorizationFailure).toHaveBeenCalledOnce());
    expect(failureCallbacks.reportAuthorizationFailure).toHaveBeenCalledWith(expect.objectContaining({ cause: failure }));
  });

  function render(connection: ConnectionProfile, spl: SecondPassClient) {
    saveConnectionProfile(connection);
    const clearAuthorizationFailure = vi.fn();
    const reportAuthorizationFailure = vi.fn();
    const onProfileChanged = vi.fn();
    act(() => root.render(
      <Harness
        profile={connection}
        spl={spl}
        clearAuthorizationFailure={clearAuthorizationFailure}
        reportAuthorizationFailure={reportAuthorizationFailure}
        onProfileChanged={onProfileChanged}
      />,
    ));
    return {
      clearAuthorizationFailure,
      reportAuthorizationFailure,
      onProfileChanged,
      getCurrentUser: spl.account.getCurrentUser,
    };
  }
});

function Harness(input: {
  profile: ConnectionProfile;
  spl: SecondPassClient;
  clearAuthorizationFailure(): void;
  reportAuthorizationFailure(error: unknown): void;
  onProfileChanged(): void;
}) {
  useAppAuthenticatedContextController({
    workflowStep: "library_home",
    ...input,
  });
  return null;
}

function client(user: Promise<CurrentUser>): SecondPassClient {
  return {
    account: { getCurrentUser: vi.fn(() => user) },
    server: { info: vi.fn(async () => serverInfo()) },
  } as unknown as SecondPassClient;
}

function profile(id: string, accessToken: string): ConnectionProfile {
  return {
    id,
    label: "Library",
    serverBaseUrl: "https://library.example",
    apiBaseUrl: "https://library.example/api/v1",
    accessToken,
    verifiedAt: "2026-09-14T00:00:00.000Z",
    verifiedUser: { profileId: "profile-a", username: "reader-old" },
    createdAt: "2026-09-14T00:00:00.000Z",
  };
}

function currentUser(profileId: string): CurrentUser {
  return {
    profileId,
    username: "reader",
    email: "reader@example.test",
    firstName: "Read",
    lastName: "Er",
    role: "reader",
    mustChangePassword: false,
    isOwner: false,
    isManager: false,
    isLibrarian: false,
    isReader: true,
    canAccessDjangoAdmin: false,
    groups: [],
  };
}

function serverInfo(): ServerInfo {
  return {
    name: "Library",
    description: "",
    bannerText: "",
    advancedLibraryGroupsEnabled: false,
    readingClientBaseUrl: "https://library.example",
    marginaliaProfileUri: "https://library.example/profile",
    publicGroup: { id: "public", name: "Public", description: "" },
    version: "1",
    releaseDate: "2026-09-15",
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}
