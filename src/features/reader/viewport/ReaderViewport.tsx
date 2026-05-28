import { forwardRef } from "react";

export type ReaderViewportStatus = "empty" | "loading" | "ready" | "error";

export type ReaderViewportProps = {
  status: ReaderViewportStatus;
  title?: string;
  errorMessage?: string;
  footerText?: string;
};

// Owns DOM mount surface only; does not know about sessions, server, or engine objects.
export const ReaderViewport = forwardRef<HTMLDivElement, ReaderViewportProps>(function ReaderViewport(props, ref) {
  return (
    <div className="spReaderViewport" aria-busy={props.status === "loading" ? true : undefined}>
      <div className="spReaderViewportHeader">
        <div className="muted">{props.title ?? "ReaderViewport"}</div>
        <div className="muted">Status: {props.status}</div>
      </div>

      {props.status === "error" ? <div className="errorText">{props.errorMessage ?? "Reader failed to load."}</div> : null}

      <div className="spReaderViewportMount" ref={ref} />

      {props.footerText ? <div className="muted spReaderViewportMeta">{props.footerText}</div> : null}
    </div>
  );
});
