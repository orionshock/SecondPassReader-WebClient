export type ServerPreset = {
  url: string;
};

export function parseServerPresets(value: unknown): ServerPreset[] {
  if (!Array.isArray(value)) return [];
  const urls = value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const url = item.trim();
    return url ? [url] : [];
  });
  return urls.map((url) => ({ url }));
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
