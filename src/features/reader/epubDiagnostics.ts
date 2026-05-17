export type EpubBlobDiagnostics = {
  blobSize: number;
  blobType: string;
  firstBytesHex: string;
  firstBytesAscii: string;
  looksLikeZip: boolean;
};

export async function inspectBlob(blob: Blob, bytesToRead = 16): Promise<EpubBlobDiagnostics> {
  const size = blob.size;
  const type = blob.type || "";
  const slice = blob.slice(0, Math.min(bytesToRead, size));
  const buf = await slice.arrayBuffer();
  const u8 = new Uint8Array(buf);

  const firstBytesHex = Array.from(u8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");

  const firstBytesAscii = Array.from(u8)
    .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : "."))
    .join("");

  const looksLikeZip = u8.length >= 2 && u8[0] === 0x50 && u8[1] === 0x4b; // "PK"

  return {
    blobSize: size,
    blobType: type,
    firstBytesHex,
    firstBytesAscii,
    looksLikeZip,
  };
}

