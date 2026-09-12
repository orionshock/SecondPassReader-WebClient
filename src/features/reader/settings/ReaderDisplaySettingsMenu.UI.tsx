import { useRef } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import type { ReaderFontFamily, ReaderLineHeight, ReaderSettings, ReaderTheme, ReaderWidth } from "../../../storage/ReaderSettings.Store";
import {
  READER_FONT_OPTIONS,
  READER_FONT_SIZE_OPTION_LABELS,
  READER_LINE_HEIGHT_OPTIONS,
  READER_THEME_OPTIONS,
  READER_WIDTH_OPTIONS,
} from "./ReaderDisplaySettings.Presenter";
import { useModalDialogFocus } from "../../../components/ModalDialogFocus.Lifecycle";

export function ReaderDisplaySettingsMenu(props: {
  open: boolean;
  disabled?: boolean;
  settings: ReaderSettings;
  onOpen: () => void;
  onClose: () => void;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onReset?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  useModalDialogFocus({ active: props.open, dialogRef: panelRef, initialFocusRef: closeButtonRef, onDismiss: props.onClose });

  return (
    <>
      <button
        type="button"
        className="spReaderSettingsButton"
        onClick={() => (props.open ? props.onClose() : props.onOpen())}
        disabled={props.disabled}
        aria-label="Reader settings"
        title="Reader settings"
        aria-expanded={props.open}
      >
        <MaterialIcon name="settings" className="spReaderSettingsButtonIcon" />
      </button>

      {props.open ? (
        <div
          className="spReaderSettingsBackdrop"
          role="presentation"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
            props.onClose();
          }}
        >
          <div
            ref={panelRef}
            className="spReaderSettingsPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-settings-title"
            tabIndex={-1}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="spReaderSettingsHeader">
              <h2 id="reader-settings-title" className="spReaderSettingsTitle">Reader settings</h2>
              <button
                ref={closeButtonRef}
                type="button"
                className="button buttonCompact spIconButton spReaderSettingsCloseButton"
                onClick={props.onClose}
                aria-label="Close reader settings"
                title="Close"
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="spReaderSettingsBody">
              <ReaderSettingsButtonGroup
                label="Theme"
                options={READER_THEME_OPTIONS}
                value={props.settings.theme}
                onPick={(theme) => props.onChange({ theme })}
              />
              <ReaderSettingsButtonGroup
                label="Font"
                options={READER_FONT_OPTIONS}
                value={props.settings.fontFamily}
                onPick={(fontFamily) => props.onChange({ fontFamily })}
              />
              <ReaderSettingsButtonGroup
                label="Size"
                options={READER_FONT_SIZE_OPTION_LABELS}
                value={props.settings.fontSizePercent}
                onPick={(fontSizePercent) => props.onChange({ fontSizePercent })}
              />
              <ReaderSettingsButtonGroup
                label="Line height"
                options={READER_LINE_HEIGHT_OPTIONS}
                value={props.settings.lineHeight}
                onPick={(lineHeight) => props.onChange({ lineHeight })}
              />
              <ReaderSettingsButtonGroup
                label="Width"
                options={READER_WIDTH_OPTIONS}
                value={props.settings.readerWidth}
                onPick={(readerWidth) => props.onChange({ readerWidth })}
              />
              {props.onReset ? (
                <div className="spReaderSettingsResetRow">
                  <button type="button" className="button buttonCompact" onClick={props.onReset}>
                    Reset
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ReaderSettingsButtonGroup<T extends ReaderTheme | ReaderFontFamily | ReaderLineHeight | ReaderWidth | number>(props: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <div className="spReaderSettingsGroup">
      <div className="spReaderSettingsGroupLabel">{props.label}</div>
      <div className="spReaderSettingsChoiceRow" role="group" aria-label={props.label}>
        {props.options.map((option) => {
          const active = option.value === props.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              className={`spReaderSettingsChoice${active ? " spReaderSettingsChoiceActive" : ""}`}
              onClick={() => props.onPick(option.value)}
              aria-pressed={active}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
