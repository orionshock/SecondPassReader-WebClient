import { sha256 } from "@noble/hashes/sha2.js";
import { normalizeOfflineEpubChecksum } from "./OfflineEpubAsset.Policy";

type OfflineEpubVerificationDiagnostic = {
  observedByteLength: number;
  fileSizeMismatch: boolean | null;
};

export type OfflineEpubVerificationResult =
  | (OfflineEpubVerificationDiagnostic & {
      status: "verified";
      checksum: string;
    })
  | (OfflineEpubVerificationDiagnostic & {
      status: "checksum-mismatch";
      expectedChecksum: string;
      observedChecksum: string;
    })
  | (OfflineEpubVerificationDiagnostic & { status: "unverifiable" })
  | (OfflineEpubVerificationDiagnostic & { status: "failed" });

export async function verifyOfflineEpubBlob(input: {
  blob: Blob;
  expectedChecksum?: string | null;
  expectedFileSize?: number | null;
}): Promise<OfflineEpubVerificationResult> {
  const expectedChecksum = normalizeOfflineEpubChecksum(input.expectedChecksum);
  const diagnostic = buildDiagnostic(input.blob.size, input.expectedFileSize);
  if (!expectedChecksum) return { status: "unverifiable", ...diagnostic };

  let hash: ReturnType<typeof sha256.create> | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    hash = sha256.create();
    reader = input.blob.stream().getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      hash.update(chunk.value);
    }

    const observedChecksum = bytesToLowercaseHex(hash.digest());
    if (observedChecksum !== expectedChecksum) {
      return {
        status: "checksum-mismatch",
        expectedChecksum,
        observedChecksum,
        ...diagnostic,
      };
    }

    return { status: "verified", checksum: observedChecksum, ...diagnostic };
  } catch {
    try {
      hash?.destroy();
    } catch {
      // Hash cleanup failure does not change the normalized verification failure.
    }
    try {
      await reader?.cancel();
    } catch {
      // Stream cleanup failure does not change the normalized verification failure.
    }
    return { status: "failed", ...diagnostic };
  } finally {
    try {
      reader?.releaseLock();
    } catch {
      // A browser-owned reader may already have released its lock after failure.
    }
  }
}

function buildDiagnostic(
  observedByteLength: number,
  expectedFileSize: number | null | undefined,
): OfflineEpubVerificationDiagnostic {
  return {
    observedByteLength,
    fileSizeMismatch: Number.isFinite(expectedFileSize) && expectedFileSize !== undefined
      && expectedFileSize !== null && expectedFileSize >= 0
      ? observedByteLength !== expectedFileSize
      : null,
  };
}

function bytesToLowercaseHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
}
