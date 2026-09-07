import { useCallback, useEffect, useRef, useState } from "react";
import type { MarginaliaRecentSession } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { MaterialIcon } from "../../components/Material.Icon";
import { routeToHash } from "../../app/AppNavigation.Router";
import { resolveCoverUrl } from "./BookCover.Mapper";
import { getSessionDisplayName } from "../sessions/SessionDisplayName.Presenter";

function formatLastActivity(isoUtc: string): string {
  try {
    const date = new Date(isoUtc);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : isoUtc;
  } catch {
    return isoUtc;
  }
}

export function RecentReadingCarousel({
  items,
  profile,
  disabled,
  onResume,
}: {
  items: MarginaliaRecentSession[];
  profile: ConnectionProfile | null;
  disabled: boolean;
  onResume: (bookId: string | number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [brokenCoverIds, setBrokenCoverIds] = useState<Record<string, true>>({});
  const [hasOverflow, setHasOverflow] = useState(items.length > 1);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(items.length > 1);

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const overflow = track.scrollWidth - track.clientWidth > 1;
    const maximum = Math.max(0, track.scrollWidth - track.clientWidth);
    setHasOverflow(overflow);
    setCanScrollLeft(overflow && track.scrollLeft > 1);
    setCanScrollRight(overflow && track.scrollLeft < maximum - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const track = trackRef.current;
    if (!track) return;

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateScrollState);
      observer.observe(track);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [items.length, updateScrollState]);

  function scroll(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * Math.max(160, track.clientWidth * 0.8), behavior: "smooth" });
  }

  return (
    <div className="recentCarouselFrame">
      <div
        ref={trackRef}
        className="recentCarousel"
        role="region"
        aria-label="Recent reading"
        onScroll={updateScrollState}
      >
        {items.map((item) => {
          const id = String(item.book.id);
          const coverSrc = brokenCoverIds[id] ? undefined : resolveCoverUrl(item.book.coverUrl, profile);
          const lastActivity = formatLastActivity(item.lastActivityAt);
          const sessionName = getSessionDisplayName(item.name, item.id);
          const statusLabel = item.status === "closed" ? "Closed" : "Active";
          const locationLabel = item.progress?.locationLabel;
          return (
            <a
              key={item.id}
              className="recentBookCard"
              href={routeToHash({ kind: "reader", bookId: id })}
              onClick={(event) => {
                event.preventDefault();
                if (!disabled) onResume(item.book.id);
              }}
              aria-disabled={disabled}
              aria-label={`Resume ${item.book.title}, last read ${lastActivity}`}
            >
              <span className="recentCoverWrap">
                {coverSrc ? (
                  <img
                    className="recentCoverImg"
                    src={coverSrc}
                    alt=""
                    loading="lazy"
                    onError={() => setBrokenCoverIds((previous) => ({ ...previous, [id]: true }))}
                  />
                ) : (
                  <span className="recentCoverPlaceholder">No cover</span>
                )}
                <span className="recentCardScrim" aria-hidden="true" />
                <span className="recentCardMetadata">
                  <span className={`recentStatusBadge recentStatusBadge${statusLabel}`}>{statusLabel}</span>
                  <span className="recentBookTitle">{item.book.title}</span>
                  <span className="recentSessionName">{sessionName}</span>
                  <span className="recentBookMeta">{lastActivity}</span>
                  {locationLabel && /\S/.test(locationLabel) ? (
                    <span className="recentProgressLabel">{locationLabel}</span>
                  ) : null}
                </span>
              </span>
            </a>
          );
        })}
      </div>

      {hasOverflow ? (
        <>
          <button
            type="button"
            className="recentCarouselControl recentCarouselControlLeft"
            aria-label="Scroll recent reading left"
            onClick={() => scroll(-1)}
            disabled={!canScrollLeft}
          >
            <MaterialIcon name="chevron_left" />
          </button>
          <button
            type="button"
            className="recentCarouselControl recentCarouselControlRight"
            aria-label="Scroll recent reading right"
            onClick={() => scroll(1)}
            disabled={!canScrollRight}
          >
            <MaterialIcon name="chevron_right" />
          </button>
        </>
      ) : null}
    </div>
  );
}
