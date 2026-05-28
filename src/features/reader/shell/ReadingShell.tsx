import { ReaderViewport } from "../viewport/ReaderViewport";
import type { ReadingShellCommand, ReadingShellEvent, ReaderAnnotation, ReaderLocationTarget } from "./types";

export type ReadingShellProps = {
  blob: Blob;
  initialDisplayTarget?: ReaderLocationTarget;
  annotations?: ReaderAnnotation[];
  onEvent?: (event: ReadingShellEvent) => void;
  onCommand?: (command: ReadingShellCommand) => void;
};

export function ReadingShell(props: ReadingShellProps) {
  return (
    <div className="spReadingShell">
      <div className="muted spReadingShellLabel">ReadingShell placeholder (engine-owned boundary)</div>
      <ReaderViewport blob={props.blob} />
    </div>
  );
}

