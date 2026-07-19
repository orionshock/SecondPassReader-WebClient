import { describe, expect, it, vi } from "vitest";
import type { ClientApiPollResponse, SecondPassClient, SecondPassDiscovery } from "@secondpass/client";
import { verifySecondPassServer } from "../features/connection/connectionUtils";
import { runPairingAttempt } from "../features/connection/pairingFlow";

const discovery: SecondPassDiscovery = {
  server_name: "Test Library",
  api_base_url: "https://library.example/api/v1",
};

describe("pairing workflow", () => {
  it("requests a code from discovered server facts and starts polling its URL", async () => {
    const api = pairingApi([{ status: "approved", ...approval() }]);

    await run(api);

    expect(api.createLoginRequest).toHaveBeenCalledWith(discovery, { clientName: "Test Browser", clientType: "reader" });
    expect(api.pollLoginRequest).toHaveBeenCalledWith("https://library.example/pair/request-1");
  });

  it("keeps polling after pending without persisting early", async () => {
    const api = pairingApi([{ status: "pending" }, { status: "approved", ...approval() }]);
    const persist = vi.fn();
    const releaseDelay = deferred<void>();
    const attempt = run(api, { onApproved: persist, delay: () => releaseDelay.promise, now: () => 100 });

    await vi.waitFor(() => expect(api.pollLoginRequest).toHaveBeenCalledTimes(1));
    expect(persist).not.toHaveBeenCalled();
    releaseDelay.resolve();
    await attempt;

    expect(api.pollLoginRequest).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("persists an approved connection exactly once and stops polling", async () => {
    const api = pairingApi([{ status: "approved", ...approval() }]);
    const savedProfiles: Array<Record<string, unknown>> = [];

    await run(api, {
      onApproved: (approved) => savedProfiles.push({
        accessToken: approved.access_token,
        tokenType: approved.token_type,
        clientSessionId: approved.client_session.id,
      }),
    });

    expect(savedProfiles).toEqual([{ accessToken: "secret-token", tokenType: "Bearer", clientSessionId: "session-1" }]);
    expect(api.pollLoginRequest).toHaveBeenCalledOnce();
  });

  it.each(["denied", "expired", "consumed"] as const)("stops without persistence when pairing is %s", async (status) => {
    const api = pairingApi([{ status }]);
    const persist = vi.fn();

    await expect(run(api, { onApproved: persist })).rejects.toThrow(`Linking ended: ${status}`);

    expect(persist).not.toHaveBeenCalled();
    expect(api.pollLoginRequest).toHaveBeenCalledOnce();
  });

  it("stops without persistence on a polling error", async () => {
    const api = pairingApi([new Error("Network unavailable")]);
    const persist = vi.fn();

    await expect(run(api, { onApproved: persist })).rejects.toThrow("Network unavailable");

    expect(persist).not.toHaveBeenCalled();
    expect(api.pollLoginRequest).toHaveBeenCalledOnce();
  });

  it("ignores an approval that resolves after cancellation", async () => {
    const latePoll = deferred<ClientApiPollResponse>();
    const api = pairingApi([latePoll.promise]);
    const persist = vi.fn();
    const abort = new AbortController();
    const attempt = run(api, { signal: abort.signal, onApproved: persist });

    await vi.waitFor(() => expect(api.pollLoginRequest).toHaveBeenCalledOnce());
    abort.abort();
    latePoll.resolve({ status: "approved", ...approval() });
    await expect(attempt).resolves.toBeUndefined();

    expect(persist).not.toHaveBeenCalled();
  });

  it("does not request pairing when mandatory discovery fails", async () => {
    const api = pairingApi([]);
    const discover = vi.fn().mockRejectedValue(new Error("Not a SecondPass server"));

    await expect(verifySecondPassServer("https://library.example", discover)).rejects.toThrow("Not a SecondPass server");

    expect(discover).toHaveBeenCalledWith("https://library.example");
    expect(api.createLoginRequest).not.toHaveBeenCalled();
  });
});

function run(api: ReturnType<typeof pairingApi>, overrides: {
  signal?: AbortSignal;
  onApproved?: Parameters<typeof runPairingAttempt>[0]["onApproved"];
  delay?: Parameters<typeof runPairingAttempt>[0]["delay"];
  now?: () => number;
} = {}) {
  return runPairingAttempt({
    spl: { server: api } as unknown as SecondPassClient,
    discovery,
    clientName: "Test Browser",
    signal: overrides.signal ?? new AbortController().signal,
    onLoginRequest: vi.fn(),
    onPollScheduled: vi.fn(),
    onApproved: overrides.onApproved ?? vi.fn(),
    delay: overrides.delay ?? (async () => undefined),
    now: overrides.now,
  });
}

function pairingApi(results: Array<ClientApiPollResponse | Error | Promise<ClientApiPollResponse>>) {
  const pollLoginRequest = vi.fn();
  for (const result of results) {
    if (result instanceof Error) pollLoginRequest.mockRejectedValueOnce(result);
    else pollLoginRequest.mockReturnValueOnce(Promise.resolve(result));
  }
  return {
    createLoginRequest: vi.fn().mockResolvedValue({
      id: "request-1",
      code: "ABC-123",
      authorize_url: "https://library.example/authorize",
      poll_url: "https://library.example/pair/request-1",
      expires_at: "2026-01-01T00:05:00Z",
      interval: 1,
    }),
    pollLoginRequest,
  };
}

function approval() {
  return {
    access_token: "secret-token",
    token_type: "Bearer" as const,
    client_session: { id: "session-1", name: "Test Browser", client_type: "reader" },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
