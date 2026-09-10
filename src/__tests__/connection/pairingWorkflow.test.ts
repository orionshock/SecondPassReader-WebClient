import { describe, expect, it, vi } from "vitest";
import type { ClientApiConsumeResponse, ClientApiPollResponse, SecondPassClient, SecondPassDiscovery } from "@secondpass/client";
import { verifySecondPassServer } from "../../features/connection/ConnectionServer.Queries";
import {
  getPairingErrorMessage,
  PAIRING_ALREADY_USED_MESSAGE,
  runPairingAttempt,
} from "../../features/connection/PairingFlow.Controller";

const discovery: SecondPassDiscovery = {
  server_name: "Test Library",
  api_base_url: "https://library.example/api/v1",
  client_api: {
    discovery_version: "1",
    login_request_endpoint: "/api/v1/client-api/login-requests/",
    poll_endpoint_template: "/api/v1/client-api/login-requests/%7Bid%7D/poll/",
    consume_endpoint_template: "/api/v1/client-api/login-requests/%7Bid%7D/consume/",
    token_type: "Bearer",
  },
};

describe("pairing workflow", () => {
  it("uses concrete create URLs and consumes after approval", async () => {
    const api = pairingApi([{ status: "approved" }], [consumed()]);

    await run(api);

    expect(api.createLoginRequest).toHaveBeenCalledWith(discovery, { clientName: "Test Browser", clientType: "reader" });
    expect(api.pollLoginRequest).toHaveBeenCalledWith("https://library.example/concrete/poll/request-1");
    expect(api.consumeLoginRequest).toHaveBeenCalledWith("https://library.example/concrete/consume/request-1");
    expect(api.pollLoginRequest).not.toHaveBeenCalledWith(discovery.client_api.poll_endpoint_template);
  });

  it("continues polling after pending without consuming early", async () => {
    const api = pairingApi([{ status: "pending" }, { status: "approved" }], [consumed()]);
    const persist = vi.fn();
    const releaseDelay = deferred<void>();
    const attempt = run(api, { onConsumed: persist, delay: () => releaseDelay.promise, now: () => 100 });

    await vi.waitFor(() => expect(api.pollLoginRequest).toHaveBeenCalledTimes(1));
    expect(api.consumeLoginRequest).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    releaseDelay.resolve();
    await attempt;

    expect(api.pollLoginRequest).toHaveBeenCalledTimes(2);
    expect(api.consumeLoginRequest).toHaveBeenCalledOnce();
  });

  it("delivers consumed credentials for persistence exactly once", async () => {
    const api = pairingApi([{ status: "approved" }], [consumed()]);
    const persist = vi.fn();

    await run(api, { onConsumed: persist });

    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(consumed());
    expect(api.pollLoginRequest).toHaveBeenCalledOnce();
    expect(api.consumeLoginRequest).toHaveBeenCalledOnce();
  });

  it("reports consumed without a token from consume as start-again failure", async () => {
    const api = pairingApi([{ status: "approved" }], [{ status: "consumed" }]);
    const persist = vi.fn();

    await expect(run(api, { onConsumed: persist })).rejects.toThrow(PAIRING_ALREADY_USED_MESSAGE);
    expect(persist).not.toHaveBeenCalled();
  });

  it("reports consumed from poll as start-again failure without consuming", async () => {
    const api = pairingApi([{ status: "consumed" }], []);
    const persist = vi.fn();

    await expect(run(api, { onConsumed: persist })).rejects.toThrow(PAIRING_ALREADY_USED_MESSAGE);
    expect(api.consumeLoginRequest).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it.each(["denied", "expired"] as const)("stops on %s without consuming or persisting", async (status) => {
    const api = pairingApi([{ status }], []);
    const persist = vi.fn();

    await expect(run(api, { onConsumed: persist })).rejects.toThrow();
    expect(api.consumeLoginRequest).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("does not persist a consume result that arrives after cancellation", async () => {
    const lateConsume = deferred<ClientApiConsumeResponse>();
    const api = pairingApi([{ status: "approved" }], [lateConsume.promise]);
    const persist = vi.fn();
    const abort = new AbortController();
    const attempt = run(api, { signal: abort.signal, onConsumed: persist });

    await vi.waitFor(() => expect(api.consumeLoginRequest).toHaveBeenCalledOnce());
    abort.abort();
    lateConsume.resolve(consumed());
    await expect(attempt).resolves.toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
  });

  it("does not create a pairing request when discovery fails", async () => {
    const api = pairingApi([], []);
    const discover = vi.fn().mockRejectedValue(new Error("Not a SecondPass server"));

    await expect(verifySecondPassServer("https://library.example", discover)).rejects.toThrow("Not a SecondPass server");
    expect(api.createLoginRequest).not.toHaveBeenCalled();
  });

  it("maps malformed failures to bounded UI copy instead of exposing a TypeError", () => {
    const reason = new TypeError("Cannot read properties of undefined (reading 'id') at https://private.example/poll/request-1");
    expect(getPairingErrorMessage(reason)).toBe("Could not start linking with this server.");
  });
});

function run(api: ReturnType<typeof pairingApi>, overrides: {
  signal?: AbortSignal;
  onConsumed?: Parameters<typeof runPairingAttempt>[0]["onConsumed"];
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
    onConsumed: overrides.onConsumed ?? vi.fn(),
    delay: overrides.delay ?? (async () => undefined),
    now: overrides.now,
  });
}

function pairingApi(
  polls: Array<ClientApiPollResponse | Error | Promise<ClientApiPollResponse>>,
  consumes: Array<ClientApiConsumeResponse | Error | Promise<ClientApiConsumeResponse>>,
) {
  const pollLoginRequest = queuedMock(polls);
  const consumeLoginRequest = queuedMock(consumes);
  return {
    createLoginRequest: vi.fn().mockResolvedValue({
      id: "request-1",
      code: "ABC-123",
      authorizeUrl: "https://library.example/authorize/request-1",
      pollUrl: "https://library.example/concrete/poll/request-1",
      consumeUrl: "https://library.example/concrete/consume/request-1",
      expiresAt: "2026-08-04T00:05:00Z",
      interval: 1,
    }),
    pollLoginRequest,
    consumeLoginRequest,
  };
}

function queuedMock<T>(results: Array<T | Error | Promise<T>>) {
  const mock = vi.fn();
  for (const result of results) {
    if (result instanceof Error) mock.mockRejectedValueOnce(result);
    else mock.mockReturnValueOnce(Promise.resolve(result));
  }
  return mock;
}

function consumed() {
  return {
    status: "consumed" as const,
    accessToken: "secret-token",
    tokenType: "Bearer",
    clientSession: { id: "session-1", name: "Test Browser", clientType: "reader" },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
