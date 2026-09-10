// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Editor } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import {
  LimitedRichTextEditor,
  createLimitedRichTextExtensions,
  serializeLimitedRichText,
} from "../components/LimitedRichTextEditor.UI";
import {
  ShelfForm,
  createPersonalShelfInput,
  updatePersonalShelfInput,
  type ShelfFormValues,
} from "../features/shelves/ShelfForm.UI";
import { canEditShelf } from "../features/shelves/ShelfMetadata.Presenter";

const values: ShelfFormValues = {
  name: "  Reading list  ",
  description: "<p>A <strong>carefully</strong> chosen list.</p><ul><li>First</li></ul>",
  visibility: "private",
};

const noop = () => undefined;

describe("personal shelf rich-text editing", () => {
  it("renders the limited editor and only exposes supported formatting actions", () => {
    const html = renderToStaticMarkup(createElement(LimitedRichTextEditor, {
      id: "test-description",
      label: "Description",
      value: values.description,
      onChange: noop,
    }));

    for (const action of ["Bold", "Italic", "Bulleted list", "Numbered list", "Undo", "Redo"]) {
      expect(html).toContain(`aria-label="${action}"`);
    }
    for (const unsupported of ["Link", "Image", "Heading", "Code", "Blockquote", "Table", "Underline", "Strike"]) {
      expect(html).not.toContain(`aria-label="${unsupported}"`);
    }
    expect(html).not.toContain("<textarea");
    expect(html).toContain("25,000 HTML characters");
  });

  it("replaces the Shelf form textarea with the limited editor boundary", () => {
    const html = renderToStaticMarkup(createElement(ShelfForm, {
      values,
      onChange: noop,
      onSubmit: noop,
      onCancel: noop,
      submitLabel: "Save shelf",
      busy: false,
    }));

    expect(html).toContain("Loading description editor");
    expect(html).not.toContain("<textarea");
  });
  it("serializes only the configured paragraph, emphasis, break, and list vocabulary", () => {
    const editor = new Editor({
      extensions: createLimitedRichTextExtensions(),
      content: "<p>Hello</p>",
    });

    editor.commands.setContent('<ol start="4" type="A"><li><p>Fourth</p></li></ol>');
    expect(editor.getHTML()).toBe("<ol><li><p>Fourth</p></li></ol>");

    editor.commands.setContent("<p>Hello</p>");
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.toggleBold();
    editor.commands.toggleItalic();
    expect(editor.getHTML()).toBe("<p><strong><em>Hello</em></strong></p>");

    editor.commands.selectAll();
    editor.commands.toggleBulletList();
    expect(editor.getHTML()).toContain("<ul><li><p>");

    editor.commands.toggleBulletList();
    editor.commands.toggleOrderedList();
    expect(editor.getHTML()).toContain("<ol><li><p>");

    editor.commands.setTextSelection(editor.state.doc.content.size);
    editor.commands.setHardBreak();
    expect(editor.getHTML()).toContain("<br>");
    editor.destroy();
  });

  it("normalizes an empty editor to an empty API string", () => {
    expect(serializeLimitedRichText("<p></p>", true)).toBe("");
    expect(serializeLimitedRichText("<p></p>", false)).toBe("");
    expect(serializeLimitedRichText("<p>Text</p>", false)).toBe("<p>Text</p>");
  });

  it("preserves the serialized description in personal create and update payloads", () => {
    expect(createPersonalShelfInput(values)).toEqual({
      name: "Reading list",
      description: values.description,
      owner_type: "user",
      visibility: "private",
    });
    expect(updatePersonalShelfInput(values)).toEqual({
      name: "Reading list",
      description: values.description,
      visibility: "private",
    });
    expect(createPersonalShelfInput({ ...values, description: "" }).description).toBe("");
  });

  it("places server validation feedback beside the Description editor", () => {
    const html = renderToStaticMarkup(createElement(LimitedRichTextEditor, {
      id: "shelf-description",
      label: "Description",
      value: values.description,
      onChange: noop,
      error: "Description exceeds 25,000 characters.",
    }));

    expect(html).toContain('id="shelf-description-error"');
    expect(html).toContain("Description exceeds 25,000 characters.");
    expect(html.indexOf("limitedRichTextEditor")).toBeLessThan(html.indexOf("Description exceeds"));
  });

  it("never grants edit controls to group-owned or server-owned shelves", () => {
    expect(canEditShelf({ id: "personal", name: "Mine", owner_type: "user", can_edit: true })).toBe(true);
    expect(canEditShelf({ id: "group", name: "Group", owner_type: "group", can_edit: true })).toBe(false);
    expect(canEditShelf({ id: "server", name: "Server", owner_type: "server", can_edit: true })).toBe(false);
    expect(canEditShelf({ id: "shared", name: "Shared", owner_type: "user", can_edit: false })).toBe(false);
  });
});
