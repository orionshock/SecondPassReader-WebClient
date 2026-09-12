import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { BookDetail } from "@secondpass/client";
import { InlineMeta } from "../../../../components/Metadata.UI";
import { BookDescription } from "../../BookDescription.UI";
import { createOfflineBookDetailController } from "./OfflineBookDetail.Controller";
import { formatOfflineBookAssetBytes, type OfflineBookDetail } from "./OfflineBookDetail.Presenter";
import { useModalDialogFocus } from "../../../../components/ModalDialogFocus.Lifecycle";

export function OfflineBookDetailDialog({
  namespaceKey,
  bookId,
  onClose,
  onOpenReader,
  onManageOffline,
}: {
  namespaceKey: string | null;
  bookId: string;
  onClose(): void;
  onOpenReader(book: BookDetail): void;
  onManageOffline(): void;
}) {
  const controller = useMemo(
    () => createOfflineBookDetailController({ namespaceKey, bookId }),
    [bookId, namespaceKey],
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  useEffect(() => controller.start(), [controller]);
  useModalDialogFocus({ active: true, dialogRef, initialFocusRef: closeButtonRef, onDismiss: onClose });

  const detail = state.detail;
  const availabilityLabel = detail ? offlineAvailabilityLabel(detail.availability) : null;
  return (
    <div
      className="modalOverlay"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} className="modalPanel" role="dialog" aria-modal="true" aria-labelledby="offline-book-detail-dialog-title" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <div className="modalHeaderRow">
          <div id="offline-book-detail-dialog-title" className="modalTitle" title={detail?.title ?? `Book ${bookId}`}>
            {detail?.title ?? `Book ${bookId}`}
          </div>
          <button ref={closeButtonRef} type="button" className="button buttonCompact" onClick={onClose} aria-label="Close book details">
            Close
          </button>
        </div>
        <div className="modalBody">
          {state.status === "loading" ? <p className="muted">{`Loading saved book details${"\u2026"}`}</p> : null}
          {state.status === "unavailable" ? <p className="muted">Saved book details are unavailable until this connection is verified.</p> : null}
          {state.status === "error" ? <div className="errorText">{state.message ?? "Saved book details could not be loaded."}</div> : null}
          {state.status === "ready" && detail ? (
            <div className="bookDetailPanel offlineBookDetailPanel">
              <div className="bookDetailHero">
                <div className="bookDetailCover"><div className="bookDetailCoverPlaceholder" aria-hidden="true">No cover</div></div>
                <div className="bookDetailHeroContent">
                  <div className="muted offlineBookDetailContext">Saved book details</div>
                  <h2 className="bookDetailTitle">{detail.title}</h2>
                  {detail.subtitle ? <div className="bookDetailSubtitle">{detail.subtitle}</div> : null}
                  {detail.series ? <div className="bookDetailRelationLine muted"><span>Series</span><span>{detail.series}</span></div> : null}
                  {detail.authors ? <div className="bookDetailRelationLine muted"><span>By</span><span>{detail.authors}</span></div> : null}
                  <div className="bookDetailMetaLine muted"><InlineMeta items={[detail.publisher, detail.language]} /></div>
                  {detail.format || detail.assetBytes !== null ? (
                    <div className="bookDetailMetaLine muted">
                      <InlineMeta items={[detail.format?.toUpperCase() ?? null, formatOfflineBookAssetBytes(detail.assetBytes)]} />
                    </div>
                  ) : null}
                  {detail.description ? (
                    <div className="bookDetailSummaryBlock">
                      <BookDescription description={detail.description} expanded={descriptionExpanded} id="offline-book-detail-summary" />
                      <button
                        type="button"
                        className="bookDetailSummaryToggle"
                        aria-expanded={descriptionExpanded}
                        aria-controls="offline-book-detail-summary"
                        onClick={() => setDescriptionExpanded((value) => !value)}
                      >
                        {descriptionExpanded ? "Show less" : "Show more"}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="bookDetailActions">
                  <button
                    type="button"
                    className="button buttonPrimary"
                    disabled={!detail.canOpenReader}
                    onClick={() => { if (detail.book && detail.canOpenReader) onOpenReader(detail.book); }}
                  >
                    Open reader
                  </button>
                </div>
              </div>
              <div className="bookOfflineAvailability" aria-live="polite">
                <div className="bookOfflineAvailabilityStatus">
                  <strong>Offline</strong>
                  <span className="muted">{availabilityLabel}</span>
                  {state.message ? <span className="errorText">{state.message}</span> : null}
                  {detail.availability === "not-available" ? (
                    <span className="muted">Make this Book available next time you are online.</span>
                  ) : null}
                </div>
                {detail.asset ? <button type="button" className="button" onClick={onManageOffline}>Manage offline</button> : null}
                {detail.asset ? (
                  <button
                    type="button"
                    className="button"
                    disabled={state.action === "removing"}
                    onClick={() => void controller.removeAsset()}
                  >
                    {state.action === "removing" ? "Removing offline copy..." : "Remove offline copy"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function offlineAvailabilityLabel(availability: OfflineBookDetail["availability"]): string {
  switch (availability) {
    case "available": return "Available offline";
    case "needs-attention": return "Offline copy needs attention";
    case "unsupported-format": return "This format is not supported by the current Reader";
    case "not-available": return "Not available offline";
    case "unknown": return "Offline availability could not be checked";
  }
}
