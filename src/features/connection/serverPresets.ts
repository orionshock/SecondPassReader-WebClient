export type ServerPreset = {
  name: string;
  url: string;
};

export function parseServerPresets(value: unknown): ServerPreset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { name, url } = item as Record<string, unknown>;
    if (typeof name !== "string" || typeof url !== "string") return [];
    const normalized = { name: name.trim(), url: url.trim() };
    return normalized.name && normalized.url ? [normalized] : [];
  });
}

export async function loadServerPresets(fetcher: typeof fetch = fetch): Promise<ServerPreset[]> {
  try {
    const response = await fetcher("/secondpass-servers.json", { cache: "no-store" });
    if (!response.ok) return [];
    return parseServerPresets(await response.json());
  } catch {
    return [];
  }
}
