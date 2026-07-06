import { strToU8, zipSync } from "fflate";

import type { MarginaliaSplitItem } from "./marginaliaSplitExport";

export type MarginaliaZipEntry = {
  path: string;
  item: MarginaliaSplitItem;
};

export function createMarginaliaZipBlob(entries: MarginaliaZipEntry[]): Blob {
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    files[entry.path] = strToU8(`${JSON.stringify(entry.item.exportJson, null, 2)}\n`);
  }
  return new Blob([zipSync(files)], { type: "application/zip" });
}
