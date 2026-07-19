import type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  SecondPassClient,
  SecondPassDiscovery,
} from "@secondpass/client";

type ApprovedPairing = Extract<ClientApiPollResponse, { status: "approved" }>;

export async function runPairingAttempt(input: {
  spl: SecondPassClient;
  discovery: SecondPassDiscovery;
  clientName: string;
  signal: AbortSignal;
  onLoginRequest: (request: ClientApiLoginRequestResponse) => void;
  onPollScheduled: (nextPollAt: number) => void;
  onApproved: (approved: ApprovedPairing) => void;
  delay?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}) {
  const loginRequest = await input.spl.server.createLoginRequest(input.discovery, {
    clientName: input.clientName,
    clientType: "reader",
  });
  if (input.signal.aborted) return;
  input.onLoginRequest(loginRequest);

  const intervalMs = Math.max(1, Math.floor(loginRequest.interval ?? 3)) * 1000;
  const delay = input.delay ?? abortableDelay;
  const now = input.now ?? Date.now;

  while (!input.signal.aborted) {
    const result = await input.spl.server.pollLoginRequest(loginRequest.poll_url);
    if (input.signal.aborted) return;

    if (result.status === "approved") {
      input.onApproved(result);
      return;
    }
    if (result.status === "denied" || result.status === "expired" || result.status === "consumed") {
      throw new Error(`Linking ended: ${result.status}`);
    }

    input.onPollScheduled(now() + intervalMs);
    await delay(intervalMs, input.signal);
  }
}

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }

    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort);
  });
}
