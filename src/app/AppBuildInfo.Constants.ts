const version = import.meta.env.VITE_APP_VERSION?.trim() || "development";
const releaseDate = import.meta.env.VITE_APP_RELEASE_DATE?.trim() || "unknown";

export const APP_BUILD_INFO = {
  version,
  releaseDate,
} as const;
