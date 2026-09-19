import { ClipboardEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkObsidianHighlight } from "./markdownPlugins";

// Typing into one line within this pause is one step of undo, as in any editor.
const TYPING_GROUP_MS = 1000;
const HISTORY_LIMIT = 200;

type History = { past: string[]; future: string[]; typing: { line: number; at: number } | null };

function isModifier(event: { ctrlKey: boolean; metaKey: boolean }) {
  return event.ctrlKey || event.metaKey;
}

/**
 * A Markdown editor that shows every line rendered and turns the line under
 * the cursor back into source. Only one line is a text field at a time, so the
 * keys that work on a whole text — select all, copy, cut, paste, undo, jump to
 * the start or the end — are handled here for the whole instruction; left to
 * the browser they would act on one line or on the entire page.
 */
export function LiveMarkdownEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const lines = useMemo(() => value.split("\n"), [value]);
  // Nothing is edited until a line is clicked: the editor must not take the
  // focus from the field the page puts it in, such as the title.
  const [activeLine, setActiveLine] = useState(-1);
  const [allSelected, setAllSelected] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCursor = useRef<number | null>(null);
  const history = useRef<History>({ past: [], future: [], typing: null });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    const cursor = pendingCursor.current ?? textarea.value.length;
    textarea.setSelectionRange(cursor, cursor);
    pendingCursor.current = null;
    resize(textarea);
  }, [activeLine]);

  function resize(textarea: HTMLTextAreaElement) {
    textarea.style.height = "0";
    textarea.style.height = `${Math.max(38, textarea.scrollHeight)}px`;
  }

  // Every change goes through here, so undo sees it. Typing into the same line
  // is grouped; anything structural is a step of its own.
  function commit(next: string, typingLine?: number) {
    if (next === value) return;
    const h = history.current;
    const now = Date.now();
    const grouped = typingLine !== undefined && h.typing?.line === typingLine && now - h.typing.at < TYPING_GROUP_MS;
    if (!grouped) {
      h.past.push(value);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
    }
    h.future = [];
    h.typing = typingLine !== undefined ? { line: typingLine, at: now } : null;
    onChange(next);
  }

  // Puts the cursor into a line; the effect above does it when the line
  // changes, and this does it when the line stays the same.
  function activate(index: number, cursor: number) {
    pendingCursor.current = cursor;
    if (index === activeLine) {
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
        pendingCursor.current = null;
      });
    }
    setActiveLine(index);
  }

  function travel(direction: "undo" | "redo") {
    const h = history.current;
    const source = direction === "undo" ? h.past : h.future;
    const target = direction === "undo" ? h.future : h.past;
    const restored = source.pop();
    if (restored === undefined) return;
    target.push(value);
    h.typing = null;
    setAllSelected(false);
    onChange(restored);
    const restoredLines = restored.split("\n");
    const line = Math.min(Math.max(activeLine, 0), restoredLines.length - 1);
    activate(line, restoredLines[line].length);
  }

  function selectAll() {
    const editor = editorRef.current;
    if (!editor) return;
    setAllSelected(true);
    setActiveLine(-1);
    editor.focus();
    // A real selection inside the editor shows what is selected and gives the
    // copy and cut events a target; the page outside stays unselected.
    requestAnimationFrame(() => window.getSelection()?.selectAllChildren(editor));
  }

  function clearSelection() {
    setAllSelected(false);
    window.getSelection()?.removeAllRanges();
  }

  function replaceAll(text: string, cursorAtEnd = true) {
    clearSelection();
    commit(text);
    const nextLines = text.split("\n");
    const last = nextLines.length - 1;
    activate(cursorAtEnd ? last : 0, cursorAtEnd ? nextLines[last].length : 0);
  }

  // Keys that concern the whole text, wherever the focus is inside the editor.
  function handleEditorKeys(event: KeyboardEvent<HTMLDivElement>) {
    const key = event.key.toLowerCase();
    if (isModifier(event) && (key === "a" || key === "ф")) {
      event.preventDefault();
      selectAll();
      return;
    }
    if (isModifier(event) && (key === "z" || key === "я")) {
      event.preventDefault();
      travel(event.shiftKey ? "redo" : "undo");
      return;
    }
    if (isModifier(event) && (key === "y" || key === "н")) {
      event.preventDefault();
      travel("redo");
      return;
    }
    // The browser would offer to save the page.
    if (isModifier(event) && (key === "s" || key === "ы")) {
      event.preventDefault();
      return;
    }
    if (!allSelected) return;
    // With the whole text selected, the keys act on all of it.
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      replaceAll("", false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      replaceAll("\n");
    } else if (event.key === "Escape") {
      clearSelection();
    } else if (["ArrowUp", "ArrowLeft", "Home", "PageUp"].includes(event.key)) {
      event.preventDefault();
      clearSelection();
      activate(0, 0);
    } else if (["ArrowDown", "ArrowRight", "End", "PageDown"].includes(event.key)) {
      event.preventDefault();
      clearSelection();
      activate(lines.length - 1, lines[lines.length - 1].length);
    } else if (event.key.length === 1 && !isModifier(event) && !event.altKey) {
      event.preventDefault();
      replaceAll(event.key);
    }
  }

  function handleCopy(event: ClipboardEvent<HTMLDivElement>, cut: boolean) {
    if (!allSelected) return;
    // The source is copied, not the rendered text, so pasting it back keeps
    // the headings and lists.
    event.preventDefault();
    event.clipboardData.setData("text/plain", value);
    if (cut) replaceAll("", false);
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>, index?: number) {
    const text = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    if (allSelected) {
      event.preventDefault();
      replaceAll(text);
      return;
    }
    if (index === undefined || !text.includes("\n")) return;
    // Several lines pasted into one become lines of their own, with the cursor
    // after the pasted text, instead of being squeezed into the current line.
    event.preventDefault();
    const textarea = event.currentTarget as HTMLTextAreaElement;
    const before = textarea.value.slice(0, textarea.selectionStart);
    const after = textarea.value.slice(textarea.selectionEnd);
    const pasted = text.split("\n");
    const lastPasted = pasted.length - 1;
    const replaced = pasted.map((part, i) => (i === 0 ? before : "") + part + (i === lastPasted ? after : ""));
    const next = [...lines];
    next.splice(index, 1, ...replaced);
    commit(next.join("\n"));
    activate(index + lastPasted, pasted[lastPasted].length);
  }

  function updateLine(index: number, nextLine: string) {
    const next = [...lines];
    next[index] = nextLine;
    commit(next.join("\n"), index);
    requestAnimationFrame(() => {
      if (textareaRef.current) resize(textareaRef.current);
    });
  }

  // Wraps the selection in Markdown marks: bold and italic are what people
  // reach for, and the browser would otherwise open bookmarks or page info.
  function wrapSelection(textarea: HTMLTextAreaElement, index: number, mark: string) {
    const { selectionStart: start, selectionEnd: end, value: line } = textarea;
    const nextLine = line.slice(0, start) + mark + line.slice(start, end) + mark + line.slice(end);
    const next = [...lines];
    next[index] = nextLine;
    commit(next.join("\n"));
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(start + mark.length, end + mark.length);
    });
  }

  function handleLineKeys(event: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    const textarea = event.currentTarget;
    const key = event.key.toLowerCase();
    if (event.key === "Escape") {
      event.preventDefault();
      setActiveLine(-1);
      // The focus stays in the editor, so the next Ctrl+A still selects the
      // instruction and not the page.
      editorRef.current?.focus();
      return;
    }
    if (isModifier(event) && (key === "b" || key === "и")) {
      event.preventDefault();
      wrapSelection(textarea, index, "**");
      return;
    }
    if (isModifier(event) && (key === "i" || key === "ш")) {
      event.preventDefault();
      wrapSelection(textarea, index, "*");
      return;
    }
    if (isModifier(event) && event.key === "Home") {
      event.preventDefault();
      activate(0, 0);
      return;
    }
    if (isModifier(event) && event.key === "End") {
      event.preventDefault();
      activate(lines.length - 1, lines[lines.length - 1].length);
      return;
    }
    if (event.key === "Backspace" && textarea.selectionStart === 0 && textarea.selectionEnd === 0 && index > 0) {
      event.preventDefault();
      const next = [...lines];
      const previous = next[index - 1];
      next.splice(index - 1, 2, previous + next[index]);
      commit(next.join("\n"));
      activate(index - 1, previous.length);
      return;
    }
    if (event.key === "Delete" && textarea.selectionStart === textarea.value.length && textarea.selectionEnd === textarea.value.length && index < lines.length - 1) {
      event.preventDefault();
      const next = [...lines];
      next.splice(index, 2, next[index] + next[index + 1]);
      commit(next.join("\n"));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const next = [...lines];
      next.splice(index, 1, textarea.value.slice(0, textarea.selectionStart), textarea.value.slice(textarea.selectionEnd));
      commit(next.join("\n"));
      activate(index + 1, 0);
      return;
    }
    if (event.key === "ArrowUp" && textarea.selectionStart === 0 && index > 0) {
      event.preventDefault();
      activate(index - 1, lines[index - 1].length);
    }
    if (event.key === "ArrowDown" && textarea.selectionEnd === textarea.value.length && index < lines.length - 1) {
      event.preventDefault();
      activate(index + 1, 0);
    }
  }

  return <div
    ref={editorRef}
    className={`live-markdown-editor${allSelected ? " is-all-selected" : ""}`}
    role="textbox"
    aria-multiline="true"
    aria-label="Редактор Markdown"
    tabIndex={-1}
    onKeyDown={handleEditorKeys}
    onCopy={(event) => handleCopy(event, false)}
    onCut={(event) => handleCopy(event, true)}
    onPaste={(event) => handlePaste(event)}
    onMouseDown={() => { if (allSelected) setAllSelected(false); }}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAllSelected(false); }}
  >
    {lines.map((line, index) => activeLine === index ?
      <textarea key={`edit-${index}`} ref={textareaRef} className="live-markdown-active-line" value={line} rows={1} spellCheck
        onChange={(event) => updateLine(index, event.target.value)}
        onKeyDown={(event) => handleLineKeys(event, index)}
        onPaste={(event) => { event.stopPropagation(); handlePaste(event, index); }}
        onBlur={() => setActiveLine((current) => current === index ? -1 : current)}/> :
      <div key={`view-${index}`} className={`live-markdown-rendered-line${line ? "" : " empty"}`} role="button" tabIndex={0} onClick={() => activate(index, line.length)} onKeyDown={(event) => { if (!allSelected && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); activate(index, line.length); } }}>
        {line ? <ReactMarkdown remarkPlugins={[remarkGfm, remarkObsidianHighlight]}>{/^>\s*$/.test(line) ? ">  " : line}</ReactMarkdown> : <span>&nbsp;</span>}
      </div>
    )}
  </div>;
}
