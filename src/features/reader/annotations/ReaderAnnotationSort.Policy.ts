import { compareEpubCfiReadingOrder, isComparableEpubCfi } from "../engine/EpubCfiReadingOrder.Policy";

export type ReaderAnnotationSortMode = "updated" | "created" | "location";

type SortableReaderAnnotation = {
  id: string;
  createdAt: string;
  updatedAt: string;
  cfi?: string;
  cfiRange?: string;
};

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createdTime(annotation: SortableReaderAnnotation): number | null {
  return timestamp(annotation.createdAt);
}

function updatedTime(annotation: SortableReaderAnnotation): number | null {
  return timestamp(annotation.updatedAt) ?? createdTime(annotation);
}

function location(annotation: SortableReaderAnnotation): string {
  return "cfiRange" in annotation ? annotation.cfiRange ?? "" : annotation.cfi ?? "";
}

function compareOptionalTimesDescending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function compareLocations(left: SortableReaderAnnotation, right: SortableReaderAnnotation): number {
  const leftLocation = location(left);
  const rightLocation = location(right);
  const leftValid = isComparableEpubCfi(leftLocation);
  const rightValid = isComparableEpubCfi(rightLocation);
  if (leftValid !== rightValid) return leftValid ? -1 : 1;
  if (!leftValid) return 0;
  return compareEpubCfiReadingOrder(leftLocation, rightLocation) ?? 0;
}

function compareStableId(left: SortableReaderAnnotation, right: SortableReaderAnnotation): number {
  return left.id.localeCompare(right.id);
}

export function sortReaderAnnotations<T extends SortableReaderAnnotation>(
  annotations: readonly T[],
  mode: ReaderAnnotationSortMode,
): T[] {
  return [...annotations].sort((left, right) => {
    if (mode === "updated") {
      return compareOptionalTimesDescending(updatedTime(left), updatedTime(right))
        || compareOptionalTimesDescending(createdTime(left), createdTime(right))
        || compareLocations(left, right)
        || compareStableId(left, right);
    }
    if (mode === "created") {
      return compareOptionalTimesDescending(createdTime(left), createdTime(right))
        || compareLocations(left, right)
        || compareStableId(left, right);
    }
    const locationDifference = compareLocations(left, right);
    if (locationDifference !== 0) return locationDifference;
    const leftCreated = createdTime(left);
    const rightCreated = createdTime(right);
    if (leftCreated !== null && rightCreated !== null && leftCreated !== rightCreated) return leftCreated - rightCreated;
    if (leftCreated === null && rightCreated !== null) return 1;
    if (leftCreated !== null && rightCreated === null) return -1;
    return compareStableId(left, right);
  });
}
