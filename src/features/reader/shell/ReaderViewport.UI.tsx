import { forwardRef, type ReactNode } from "react";
import type { Ref } from "react";

export type ReaderViewportStatus = "empty" | "loading" | "ready" | "error";

export type ReaderViewportProps = {
  status: ReaderViewportStatus;
  errorMessage?: string;
  overlay?: ReactNode;
  mountWrapperRef?: Ref<HTMLDivElement>;
};

// Owns DOM mount surface only; does not know about sessions, server, or engine objects.
export const ReaderViewport = forwardRef<HTMLDivElement, ReaderViewportProps>(function ReaderViewport(props, ref) {
  return (
    <div className="spReaderViewport" role="region" aria-label="Book content" aria-busy={props.status === "loading" ? true : undefined}>
      {props.status === "loading" ? <span className="srOnly" role="status">Loading book...</span> : null}
      {props.status === "error" ? <div className="errorText" role="alert">{props.errorMessage ?? "Couldn't load the reader."}</div> : null}
      <div className="spReaderViewportMountWrapper" ref={props.mountWrapperRef}>
        <div className="spReaderViewportMount" ref={ref} />
        {props.overlay ? <div className="spReaderViewportOverlay">{props.overlay}</div> : null}
      </div>
    </div>
  );
});
