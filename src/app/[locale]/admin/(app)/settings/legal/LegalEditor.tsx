"use client";

import { useActionState, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useTranslations } from "next-intl";
import { updateLegalDocument } from "../actions";

type Doc = "terms" | "privacy";
type Loc = "pl" | "en";

function ToolbarButton({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`label-tight h-8 min-w-8 pointer-coarse:min-w-11 border px-2 text-[11px] transition-colors ${
        active
          ? "border-red bg-red/10 text-white"
          : "border-line-strong text-silver hover:border-ink hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const t = useTranslations("Admin.settings.legalEditor");

  const promptLink = () => {
    const previous = editor.getAttributes("link")?.href as string | undefined;
    const url = window.prompt(t("linkPrompt"), previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) {
      window.alert(t("linkInvalid"));
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="border-line bg-surface-2 flex flex-wrap gap-1 border-b p-2">
      <ToolbarButton
        label="B"
        title={t("bold")}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="I"
        title={t("italic")}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="H2"
        title={t("heading")}
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="H3"
        title={t("subheading")}
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarButton
        label={t("bulletLabel")}
        title={t("bulletList")}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label={t("numberedLabel")}
        title={t("numberedList")}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label={t("linkLabel")}
        title={t("insertLink")}
        active={editor.isActive("link")}
        onClick={promptLink}
      />
      <ToolbarButton
        label={t("quoteLabel")}
        title={t("quote")}
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
    </div>
  );
}

/**
 * Rich text editor for one legal document in one language.
 *
 * The editor's HTML is copied into a hidden input on submit — the server action
 * re-sanitises it, so whatever the editor produces is treated as untrusted.
 */
export function LegalEditor({
  doc,
  locale,
  initialHtml,
  isOverride,
}: {
  doc: Doc;
  locale: Loc;
  initialHtml: string;
  isOverride: boolean;
}) {
  const [state, action, pending] = useActionState(updateLegalDocument, null);
  const htmlRef = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState(false);
  const t = useTranslations("Admin.settings.legalEditor");
  const tc = useTranslations("Admin.settings.common");

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialHtml,
    // Tiptap renders in the browser only — without this Next warns about an SSR
    // hydration mismatch on first paint.
    immediatelyRender: false,
    onUpdate: () => setDirty(true),
    editorProps: {
      attributes: {
        class:
          "prose-legal min-h-[420px] max-w-none px-4 py-4 focus:outline-none",
      },
    },
  });

  return (
    <form
      action={action}
      onSubmit={() => {
        if (htmlRef.current && editor) {
          htmlRef.current.value = editor.getHTML();
        }
        setDirty(false);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="doc" value={doc} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="html" ref={htmlRef} />

      <div className="border-line-strong border bg-surface-1">
        {editor && <Toolbar editor={editor} />}
        <EditorContent editor={editor} />
      </div>

      {!isOverride && (
        <p className="text-ink-faint text-xs">{t("builtInNote")}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="label border-line-strong inline-flex h-10 items-center border px-5 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:opacity-50"
        >
          {pending ? tc("saving") : t("save")}
        </button>
        {dirty && !pending && (
          <span className="text-ink-faint text-xs">{t("unsaved")}</span>
        )}
        {state?.ok && (
          <span className="text-xs text-emerald-400">{state.message}</span>
        )}
        {state && !state.ok && (
          <span className="text-red text-xs">{state.error}</span>
        )}
      </div>
    </form>
  );
}
