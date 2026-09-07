import { expect, vi } from "vitest";

export type CapturedSdkRequest = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

export function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export function emptyResponse(init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(null, { status: init?.status ?? 204, headers: init?.headers });
}

export function blobResponse(blob: Blob, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(blob, { status: init?.status ?? 200, headers: init?.headers });
}

export function installMockFetch() {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
  return vi.mocked(globalThis.fetch);
}

export function installScriptedTransport(steps: Array<{ name: string; response: Response }>) {
  const pending = [...steps];
  const requests = new Map<string, CapturedSdkRequest>();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const step = pending.shift();
    if (!step) throw new Error(`Unexpected SDK request: ${String(input)}`);
    requests.set(step.name, { input, init });
    return step.response;
  }) as typeof fetch;
  return {
    request(name: string): CapturedSdkRequest {
      const request = requests.get(name);
      if (!request) throw new Error(`Named SDK request was not made: ${name}`);
      return request;
    },
    assertComplete(): void {
      expect(pending.map((step) => step.name)).toEqual([]);
    },
  };
}
