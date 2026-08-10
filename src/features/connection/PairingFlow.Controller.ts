import type {
  ClientApiConsumeResponse,
  ClientApiLoginRequestResponse,
  SecondPassClient,
  SecondPassDiscovery,
} from "@secondpass/client";

type ConsumedPairing = Extract<ClientApiConsumeResponse, { accessToken: string }>;

export const PAIRING_ALREADY_USED_MESSAGE = "Pairing was already used. Start again.";

export class PairingFlowError extends Error {}

export function getPairingErrorMessage(reason: unknown): string {
  return reason instanceof PairingFlowError ? reason.message : "Could not start linking with this server.";
}

export async function runPairingAttempt(input: {
  spl: SecondPassClient;
  discovery: SecondPassDiscovery;
  clientName: string;
  signal: AbortSignal;
  onLoginRequest: (request: ClientApiLoginRequestResponse) => void;
  onPollScheduled: (nextPollAt: number) => void;
  onConsumed: (consumed: ConsumedPairing) => void;
  delay?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}) {
  const loginRequest = await input.spl.server.createLoginRequest(input.discovery, {
    clientName: input.clientName,
    clientType: "reader",
  });
  if (input.signal.aborted) return;
  input.onLoginRequest(loginRequest);

  const intervalMs = Math.max(1, Math.floor(loginRequest.interval)) * 1000;
  const delay = input.delay ?? abortableDelay;
  const now = input.now ?? Date.now;

  while (!input.signal.aborted) {
    const poll = await input.spl.server.pollLoginRequest(loginRequest.pollUrl);
    if (input.signal.aborted) return;

    if (poll.status === "approved") {
      const consumed = await input.spl.server.consumeLoginRequest(loginRequest.consumeUrl);
      if (input.signal.aborted) return;

      if (consumed.status === "consumed") {
        if (!("accessToken" in consumed)) throw new PairingFlowError(PAIRING_ALREADY_USED_MESSAGE);
        input.onConsumed(consumed);
        return;
      }
      if (consumed.status === "denied") throw new PairingFlowError("Pairing was denied.");
      if (consumed.status === "expired") throw new PairingFlowError("Pairing expired. Start again.");
    } else if (poll.status === "denied") {
      throw new PairingFlowError("Pairing was denied.");
    } else if (poll.status === "expired") {
      throw new PairingFlowError("Pairing expired. Start again.");
    } else if (poll.status === "consumed") {
      throw new PairingFlowError(PAIRING_ALREADY_USED_MESSAGE);
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
