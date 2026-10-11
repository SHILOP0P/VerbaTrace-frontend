import { Check, Save, Upload } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { cssStyle } from "../../shared/lib/css-styles";
import { InstructionDocumentViewer } from "./InstructionDocumentViewerV2";
import { InstructionPanel } from "./InstructionWorkspace";

export function InstructionDocumentPanel({ filename, blob, content, editable, disabled, dirty, saving, onChange, onSave, onUpload }: {
  filename: string; blob?: Blob; content: string; editable?: boolean; disabled?: boolean; dirty?: boolean; saving?: boolean;
  onChange?: (content: string) => void; onSave?: () => void; onUpload?: (file: File) => Promise<void>;
}) {
  const [editor, setEditor] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const markdown = filename.toLowerCase().endsWith(".md");
  useLayoutEffect(() => {
    const root = viewport.current, body = track.current;
    if (!root || !body) return;
    const measure = () => { cssStyle(root).height = `${body.children[editor ? 1 : 0]?.getBoundingClientRect().height ?? 0}px`; };
    measure(); const observer = new ResizeObserver(measure);
    Array.from(body.children).forEach(child => observer.observe(child)); return () => observer.disconnect();
  }, [editor, markdown, replacing]);
  return <InstructionPanel kind="document" title="Инструкция" subtitle={filename} action={editable && markdown && !replacing ? <div className={`iw-document-modes ${editor ? "is-editor" : ""}`} role="group" aria-label="Режим документа">
    <button type="button" aria-pressed={!editor} onClick={() => setEditor(false)}>Просмотр</button><button type="button" aria-pressed={editor} disabled={disabled} onClick={() => setEditor(true)}>Редактор</button>
  </div> : undefined}>
    {replacing ? <div className="iw-file-zone"><Upload size={30} /><strong>Загрузите файл инструкции</strong><p>Markdown, PDF, DOCX или XLSX — документ появится в этой колонке.</p><button className="primary-button small" type="button" disabled={disabled || saving} onClick={() => input.current?.click()}>Выбрать файл</button><button className="ghost-button small" type="button" onClick={() => setReplacing(false)}>Отмена</button></div> : markdown && editable ? <div className="iw-document-viewport" ref={viewport}><div className={`iw-document-slides ${editor ? "is-editor" : ""}`} ref={track}>
      <div className="iw-document-slide iw-document-preview" aria-hidden={editor} inert={editor}><InstructionDocumentViewer filename={filename} markdown={content} /></div>
      <div className="iw-document-slide" aria-hidden={!editor} inert={!editor}><label className="iw-editor-label">Текст инструкции<textarea aria-label="Текст инструкции" value={content} disabled={disabled} onChange={event => onChange?.(event.target.value)} spellCheck={false} /></label></div>
    </div></div> : <div className="iw-document-preview"><InstructionDocumentViewer filename={filename} blob={blob} markdown={content} /></div>}
    {editable && <footer className="iw-document-footer"><button className="ghost-button small" type="button" disabled={disabled || saving} onClick={() => setReplacing(true)}><Upload size={15} />Заменить файл</button>{dirty ? <button className="primary-button small" type="button" disabled={disabled || saving} onClick={onSave}><Save size={15} />Сохранить правки</button> : <span><Check size={14} />Правки сохранены</span>}</footer>}
    <input ref={input} hidden type="file" accept=".md,.pdf,.docx,.xlsx" disabled={disabled || saving} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onUpload?.(file).then(() => { setReplacing(false); setEditor(false); }).catch(() => undefined); }} />
  </InstructionPanel>;
}
