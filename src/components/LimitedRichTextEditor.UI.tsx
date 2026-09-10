import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { OrderedList } from "@tiptap/extension-list";
import { MaterialIcon } from "./MaterialIcon.UI";
import "./LimitedRichText.Editor.css";

export const DEFAULT_LIMITED_RICH_TEXT_MAX_LENGTH = 25_000;

const AttributeFreeOrderedList = OrderedList.extend({
  addAttributes: () => ({}),
  renderHTML: () => ["ol", 0],
});

export function createLimitedRichTextExtensions() {
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      dropcursor: false,
      gapcursor: false,
      heading: false,
      horizontalRule: false,
      link: false,
      orderedList: false,
      strike: false,
      trailingNode: false,
      underline: false,
    }),
    AttributeFreeOrderedList,
  ];
}

export function serializeLimitedRichText(html: string, isEmpty: boolean): string {
  return isEmpty || html === "<p></p>" ? "" : html;
}

type LimitedRichTextEditorProps = {
  id: string;
  label: string;
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  error?: string | null;
  helpText?: string;
  maxLength?: number;
};

export function LimitedRichTextEditor({
  id,
  label,
  value,
  onChange,
  disabled = false,
  error,
  helpText = "Paragraphs, bold, italic, and lists are supported. Shift+Enter inserts a line break.",
  maxLength = DEFAULT_LIMITED_RICH_TEXT_MAX_LENGTH,
}: LimitedRichTextEditorProps) {
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const countId = `${id}-count`;
  const editor = useEditor({
    extensions: createLimitedRichTextExtensions(),
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        "aria-describedby": `${helpId} ${countId} ${errorId}`,
        "aria-invalid": error ? "true" : "false",
        class: "limitedRichTextContent",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(serializeLimitedRichText(currentEditor.getHTML(), currentEditor.isEmpty));
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    const currentValue = serializeLimitedRichText(editor.getHTML(), editor.isEmpty);
    if (currentValue !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  const toolbarDisabled = disabled || !editor;
  const count = value.length;
  const overLimit = count > maxLength;

  return (
    <div className={`field limitedRichTextField${error ? " limitedRichTextFieldError" : ""}`}>
      <span className="fieldLabel" id={labelId}>{label}</span>
      <div className="limitedRichTextEditor">
        <div className="limitedRichTextToolbar" role="toolbar" aria-label={`${label} formatting`}>
          <button
            type="button"
            className="button buttonCompact limitedRichTextToolbarButton"
            aria-label="Bold"
            title="Bold"
            aria-pressed={editor?.isActive("bold") ?? false}
            disabled={toolbarDisabled}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <MaterialIcon name="format_bold" />
          </button>
          <button
            type="button"
            className="button buttonCompact limitedRichTextToolbarButton"
            aria-label="Italic"
            title="Italic"
            aria-pressed={editor?.isActive("italic") ?? false}
            disabled={toolbarDisabled}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <MaterialIcon name="format_italic" />
          </button>
          <button
            type="button"
            className="button buttonCompact limitedRichTextToolbarButton"
            aria-label="Bulleted list"
            title="Bulleted list"
            aria-pressed={editor?.isActive("bulletList") ?? false}
            disabled={toolbarDisabled}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <MaterialIcon name="format_list_bulleted" />
          </button>
          <button
            type="button"
            className="button buttonCompact limitedRichTextToolbarButton"
            aria-label="Numbered list"
            title="Numbered list"
            aria-pressed={editor?.isActive("orderedList") ?? false}
            disabled={toolbarDisabled}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <MaterialIcon name="format_list_numbered" />
          </button>
          <span className="limitedRichTextToolbarSpacer" />
          <button
            type="button"
            className="button buttonCompact limitedRichTextToolbarButton"
            aria-label="Undo"
            title="Undo"
            disabled={toolbarDisabled || !editor?.can().undo()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <MaterialIcon name="undo" />
          </button>
          <button
            type="button"
            className="button buttonCompact limitedRichTextToolbarButton"
            aria-label="Redo"
            title="Redo"
            disabled={toolbarDisabled || !editor?.can().redo()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <MaterialIcon name="redo" />
          </button>
        </div>
        <EditorContent editor={editor} />
      </div>
      <div className="limitedRichTextMeta">
        <span className="muted" id={helpId}>{helpText}</span>
        <span className={overLimit ? "limitedRichTextCountOver" : "muted"} id={countId} aria-live="polite">
          {count.toLocaleString()} / {maxLength.toLocaleString()} HTML characters
        </span>
      </div>
      {error ? <div className="errorText limitedRichTextError" id={errorId}>{error}</div> : null}
    </div>
  );
}