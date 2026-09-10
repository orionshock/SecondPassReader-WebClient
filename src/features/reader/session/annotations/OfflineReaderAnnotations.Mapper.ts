import type { MarginaliaAnnotation } from "@secondpass/client";
import type { OfflineReaderAnnotationProjection } from "../../../../app/offline/storage/OfflineRepositories.Types";

export function mapOfflineReaderAnnotations(
  projections: readonly OfflineReaderAnnotationProjection[],
): MarginaliaAnnotation[] {
  const mapped: MarginaliaAnnotation[] = [];
  for (const projection of projections) {
    if (projection.status === "deleted") continue;
    const annotation = projection.annotation;
    const base = {
      id: `local:${annotation.clientId}`,
      clientId: annotation.clientId,
      location: {
        cfi: annotation.location.cfi,
        locationLabel: annotation.location.locationLabel ?? "",
      },
      createdAt: "",
      updatedAt: "",
    };
    if (annotation.kind === "bookmark") {
      mapped.push({ ...base, kind: "bookmark" });
      continue;
    }
    mapped.push({
      ...base,
      kind: "highlight",
      body: {
        text: annotation.body.text,
        prefix: annotation.body.prefix ?? "",
        suffix: annotation.body.suffix ?? "",
        color: annotation.body.color ?? "yellow",
        note: annotation.body.note ?? "",
      },
    });
  }
  return mapped;
}
