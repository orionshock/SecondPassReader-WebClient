import type { Section } from "@likecoin/epub-ts";

type SectionRequest = Parameters<Section["load"]>[0];

type ManagedSection = {
  section: Section;
  originalLoad: Section["load"];
  originalUnload: Section["unload"];
  wrappedLoad: Section["load"];
  wrappedUnload: Section["unload"];
  owners: number;
};

export type EpubTsSectionLoadController = {
  withSection<T>(
    section: Section,
    request: SectionRequest,
    use: (section: Section) => T | Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
  destroy(): void;
};

// epub-ts Sections hold one mutable document/contents pair. Every library and application load is
// leased so an early unload cannot clear the shared Section while another owner is still using it.
export function createEpubTsSectionLoadController(
  sections: readonly Section[],
): EpubTsSectionLoadController {
  const managed = new Map<Section, ManagedSection>();
  let destroyed = false;

  for (const section of sections) {
    const originalLoad = section.load;
    const originalUnload = section.unload;
    const entry: ManagedSection = {
      section,
      originalLoad,
      originalUnload,
      wrappedLoad: undefined!,
      wrappedUnload: undefined!,
      // Preserve a document already owned by a renderer or earlier library operation.
      owners: section.document ? 1 : 0,
    };
    entry.wrappedLoad = (async (...args: Parameters<Section["load"]>) => {
      entry.owners += 1;
      try {
        return await entry.originalLoad.apply(entry.section, args);
      } catch (error) {
        release(entry);
        throw error;
      }
    }) as Section["load"];
    entry.wrappedUnload = (() => release(entry)) as Section["unload"];
    section.load = entry.wrappedLoad;
    section.unload = entry.wrappedUnload;
    managed.set(section, entry);
  }

  return {
    async withSection(section, request, use, signal) {
      if (destroyed) throw new Error("Section load ownership is destroyed.");
      const entry = managed.get(section);
      if (!entry) throw new Error("Section is not owned by this Reader engine.");
      await section.load(request, signal);
      try {
        return await use(section);
      } finally {
        section.unload();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const entry of managed.values()) {
        if (entry.section.load === entry.wrappedLoad) entry.section.load = entry.originalLoad;
        if (entry.section.unload === entry.wrappedUnload) entry.section.unload = entry.originalUnload;
      }
      managed.clear();
    },
  };
}

function release(entry: ManagedSection): void {
  if (entry.owners > 0) entry.owners -= 1;
  if (entry.owners === 0) entry.originalUnload.call(entry.section);
}
