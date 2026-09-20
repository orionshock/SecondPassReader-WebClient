// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ApiError, type CurrentUser, type SecondPassClient, type ServerInfo } from "@secondpass/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppAuthenticatedContextController } from "../../app/AppAuthenticatedContext.Controller";
import {
  clearActiveConnection,
  getActiveConnection,
  saveActiveConnection,
  type ActiveConnection,
} from "../../storage/ActiveConnection.Store";

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
    expect(callbacks.onConnectionChanged).not.toHaveBeenCalled();
  });

  it("does not report a stale failure against a replacement connection", async () => {
    const connection = profile("connection-a", "token-a");
    const user = deferred<CurrentUser>();
    const callbacks = render(connection, client(user.promise));
    await vi.waitFor(() => expect(callbacks.getCurrentUser).toHaveBeenCalledOnce());
    const replacement = profile("connection-b", "token-b");

    saveActiveConnection(replacement);
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

    saveActiveConnection(repaired);
    user.resolve(currentUser("profile-a"));
    await act(async () => user.promise);

    expect(getActiveConnection()).toEqual(repaired);
    expect(callbacks.clearAuthorizationFailure).not.toHaveBeenCalled();
    expect(callbacks.onConnectionChanged).not.toHaveBeenCalled();
  });

  it("still publishes current success and current authorization failure", async () => {
    const success = profile("connection-a", "token-a");
    const successCallbacks = render(success, client(Promise.resolve(currentUser("profile-a"))));
    await vi.waitFor(() => expect(successCallbacks.onConnectionChanged).toHaveBeenCalledOnce());
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

  it("does not probe while browser offline and checks when it returns online", async () => {
    const connection = profile("connection-a", "token-a");
    saveActiveConnection(connection);
    const spl = client(Promise.resolve(currentUser("profile-a")));
    const callbacks = {
      clearAuthorizationFailure: vi.fn(),
      reportAuthorizationFailure: vi.fn(),
      onConnectionChanged: vi.fn(),
    };

    act(() => root.render(<Harness connection={connection} spl={spl} {...callbacks} connectivity="offline" />));
    expect(spl.account.getCurrentUser).not.toHaveBeenCalled();
    act(() => root.render(<Harness connection={connection} spl={spl} {...callbacks} connectivity="online" />));
    await vi.waitFor(() => expect(spl.account.getCurrentUser).toHaveBeenCalledOnce());
  });

  it("aborts an in-flight context check when browser connectivity turns offline", async () => {
    const connection = profile("connection-a", "token-a");
    saveActiveConnection(connection);
    const user = deferred<CurrentUser>();
    const spl = client(user.promise);
    const callbacks = {
      clearAuthorizationFailure: vi.fn(),
      reportAuthorizationFailure: vi.fn(),
      onConnectionChanged: vi.fn(),
    };
    act(() => root.render(<Harness connection={connection} spl={spl} {...callbacks} connectivity="online" />));
    await vi.waitFor(() => expect(spl.account.getCurrentUser).toHaveBeenCalledOnce());
    const signal = vi.mocked(spl.account.getCurrentUser).mock.calls[0]![0]?.signal;
    expect(signal?.aborted).toBe(false);

    act(() => root.render(<Harness connection={connection} spl={spl} {...callbacks} connectivity="offline" />));
    expect(signal?.aborted).toBe(true);
    user.resolve(currentUser("profile-a"));
    await act(async () => user.promise);
    expect(callbacks.onConnectionChanged).not.toHaveBeenCalled();
  });

  it("aborts the prior request when a newer connection starts verification", async () => {
    const first = profile("connection-a", "token-a");
    const next = profile("connection-b", "token-b");
    const pending = deferred<CurrentUser>();
    const firstClient = client(pending.promise);
    const nextClient = client(Promise.resolve(currentUser("profile-a")));
    const callbacks = {
      clearAuthorizationFailure: vi.fn(),
      reportAuthorizationFailure: vi.fn(),
      onConnectionChanged: vi.fn(),
    };
    saveActiveConnection(first);
    act(() => root.render(<Harness connection={first} spl={firstClient} {...callbacks} />));
    await vi.waitFor(() => expect(firstClient.account.getCurrentUser).toHaveBeenCalledOnce());
    const priorSignal = vi.mocked(firstClient.account.getCurrentUser).mock.calls[0]![0]?.signal;

    saveActiveConnection(next);
    act(() => root.render(<Harness connection={next} spl={nextClient} {...callbacks} />));
    await vi.waitFor(() => expect(nextClient.account.getCurrentUser).toHaveBeenCalledOnce());
    expect(priorSignal?.aborted).toBe(true);
    pending.resolve(currentUser("profile-a"));
    await act(async () => pending.promise);
    expect(getActiveConnection()?.id).toBe(next.id);
  });

  function render(connection: ActiveConnection, spl: SecondPassClient) {
    saveActiveConnection(connection);
    const clearAuthorizationFailure = vi.fn();
    const reportAuthorizationFailure = vi.fn();
    const onConnectionChanged = vi.fn();
    act(() => root.render(
      <Harness
        connection={connection}
        spl={spl}
        clearAuthorizationFailure={clearAuthorizationFailure}
        reportAuthorizationFailure={reportAuthorizationFailure}
        onConnectionChanged={onConnectionChanged}
      />,
    ));
    return {
      clearAuthorizationFailure,
      reportAuthorizationFailure,
      onConnectionChanged,
      getCurrentUser: spl.account.getCurrentUser,
    };
  }
});

function Harness(input: {
  connection: ActiveConnection;
  spl: SecondPassClient;
  clearAuthorizationFailure(): void;
  reportAuthorizationFailure(error: unknown): void;
  onConnectionChanged(): void;
  connectivity?: "online" | "offline" | "unknown";
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

function profile(id: string, accessToken: string): ActiveConnection {
  return {
    id,
    label: "Library",
    serverBaseUrl: "https://library.example",
    serverId: "123e4567-e89b-42d3-a456-426614174000",
    serverUrls: [],
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
    serverId: "123e4567-e89b-42d3-a456-426614174000",
    serverUrls: ["https://library.example"],
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
