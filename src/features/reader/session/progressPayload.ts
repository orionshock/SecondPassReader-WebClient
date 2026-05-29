import type { ReadingProgressUpdatePayload } from "@secondpass/client";
import type { ReaderLocation } from "../domain/types";

export function buildReadingProgressUpdatePayload(input: {
  profileVersion: string;
  location: ReaderLocation;
}): ReadingProgressUpdatePayload | null {
  const { profileVersion, location } = input;
  const cfi = typeof location.cfi === "string" ? location.cfi.trim() : "";
  if (!cfi) return null;

  const payload: ReadingProgressUpdatePayload = {
    profile_version: profileVersion,
    current_location: {
      format: "epub",
      cfi,
    },
  };

  const href = typeof location.href === "string" ? location.href.trim() : "";
  if (href) (payload.current_location as NonNullable<ReadingProgressUpdatePayload["current_location"]>).href = href;

  if (typeof location.bookProgress === "number" && Number.isFinite(location.bookProgress)) {
    payload.progression = location.bookProgress;
  }

  return payload;
}
