import { describe, expect, it, vi } from "vitest";
import { verifyOfflinePublicationBlob } from "../../../app/offline/publication/OfflinePublicationVerification.Actions";

const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("offline publication verification", () => {
  it("verifies a known Blob SHA-256", async () => {
    await expect(verifyOfflinePublicationBlob({
      blob: new Blob(["abc"]),
      expectedChecksum: ABC_SHA256,
    })).resolves.toEqual({
      status: "verified",
      checksum: ABC_SHA256,
      observedByteLength: 3,
      fileSizeMismatch: null,
    });
  });

  it("normalizes an uppercase expected checksum", async () => {
    const result = await verifyOfflinePublicationBlob({
      blob: new Blob(["abc"]),
      expectedChecksum: ABC_SHA256.toUpperCase(),
    });

    expect(result).toMatchObject({ status: "verified", checksum: ABC_SHA256 });
  });

  it("reports expected and observed checksums when bytes differ", async () => {
    const result = await verifyOfflinePublicationBlob({
      blob: new Blob(["different"]),
      expectedChecksum: ABC_SHA256,
    });

    expect(result).toMatchObject({
      status: "checksum-mismatch",
      expectedChecksum: ABC_SHA256,
    });
    expect(result.status === "checksum-mismatch" && result.observedChecksum).not.toBe(ABC_SHA256);
  });

  it.each([undefined, null, "", "not-a-sha-256"])(
    "skips hashing when the expected checksum is %s",
    async (expectedChecksum) => {
      const stream = vi.fn(() => {
        throw new Error("hashing should not start");
      });
      const blob = { size: 3, stream } as unknown as Blob;

      await expect(verifyOfflinePublicationBlob({ blob, expectedChecksum })).resolves.toEqual({
        status: "unverifiable",
        observedByteLength: 3,
        fileSizeMismatch: null,
      });
      expect(stream).not.toHaveBeenCalled();
    },
  );

  it("verifies an empty Blob", async () => {
    await expect(verifyOfflinePublicationBlob({
      blob: new Blob([]),
      expectedChecksum: EMPTY_SHA256,
      expectedFileSize: 0,
    })).resolves.toEqual({
      status: "verified",
      checksum: EMPTY_SHA256,
      observedByteLength: 0,
      fileSizeMismatch: false,
    });
  });

  it("keeps file-size mismatch diagnostic when the checksum verifies", async () => {
    await expect(verifyOfflinePublicationBlob({
      blob: new Blob(["abc"]),
      expectedChecksum: ABC_SHA256,
      expectedFileSize: 4,
    })).resolves.toEqual({
      status: "verified",
      checksum: ABC_SHA256,
      observedByteLength: 3,
      fileSizeMismatch: true,
    });
  });

  it("normalizes stream failures without exposing raw error content", async () => {
    const blob = {
      size: 3,
      stream: () => new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("sensitive stream failure"));
        },
      }),
    } as Blob;

    const result = await verifyOfflinePublicationBlob({ blob, expectedChecksum: ABC_SHA256 });

    expect(result).toEqual({
      status: "failed",
      observedByteLength: 3,
      fileSizeMismatch: null,
    });
    expect(JSON.stringify(result)).not.toContain("sensitive stream failure");
  });

  it("normalizes hash-update failures without exposing raw error content", async () => {
    const blob = {
      size: 3,
      stream: () => new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue("not-bytes" as unknown as Uint8Array);
          controller.close();
        },
      }),
    } as Blob;

    const result = await verifyOfflinePublicationBlob({ blob, expectedChecksum: ABC_SHA256 });

    expect(result).toEqual({
      status: "failed",
      observedByteLength: 3,
      fileSizeMismatch: null,
    });
    expect(JSON.stringify(result)).not.toContain("not-bytes");
  });
});
