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
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadLock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const markdown = filename.toLowerCase().endsWith(".md");
  const uploadDisabled = disabled || saving || uploading;
  const upload = async (file: File) => {
    if (uploadDisabled || uploadLock.current || !onUpload) return;
    uploadLock.current = true;
    setDragging(false); setUploadError(""); setUploading(true);
    try { await onUpload(file); setEditor(false); }
    catch (error) { setUploadError(error instanceof Error ? error.message : "Не удалось заменить файл."); }
    finally { uploadLock.current = false; setUploading(false); }
  };
  useLayoutEffect(() => {
    const root = viewport.current, body = track.current;
    if (!root || !body) return;
    const measure = () => { cssStyle(root).height = `${body.children[editor ? 1 : 0]?.getBoundingClientRect().height ?? 0}px`; };
    measure(); const observer = new ResizeObserver(measure);
    Array.from(body.children).forEach(child => observer.observe(child)); return () => observer.disconnect();
  }, [editor, markdown]);
  return <InstructionPanel kind="document" title="Инструкция" subtitle={filename} action={editable && markdown ? <div className={`iw-document-modes ${editor ? "is-editor" : ""}`} role="group" aria-label="Режим документа">
    <button type="button" aria-pressed={!editor} onClick={() => setEditor(false)}>Просмотр</button><button type="button" aria-pressed={editor} disabled={disabled} onClick={() => setEditor(true)}>Редактор</button>
  </div> : undefined}>
    {markdown && editable ? <div className="iw-document-viewport" ref={viewport}><div className={`iw-document-slides ${editor ? "is-editor" : ""}`} ref={track}>
      <div className="iw-document-slide iw-document-preview" aria-hidden={editor} inert={editor}><InstructionDocumentViewer filename={filename} markdown={content} /></div>
      <div className="iw-document-slide" aria-hidden={!editor} inert={!editor}><label className="iw-editor-label">Текст инструкции<textarea aria-label="Текст инструкции" value={content} disabled={disabled} onChange={event => onChange?.(event.target.value)} spellCheck={false} /></label></div>
    </div></div> : <div className="iw-document-preview"><InstructionDocumentViewer filename={filename} blob={blob} markdown={content} /></div>}
    {editable && <footer className="iw-document-footer"><button className={`ghost-button small iw-file-replace${dragging ? " is-dragging" : ""}`} type="button" disabled={uploadDisabled} aria-busy={uploading} title="Выберите или перетащите один файл: MD, PDF, DOCX, XLSX" onClick={() => input.current?.click()}
      onDragEnter={event => { event.preventDefault(); if (!uploadDisabled) setDragging(true); }}
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = uploadDisabled ? "none" : "copy"; }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={event => { event.preventDefault(); setDragging(false); if (uploadDisabled) return; if (event.dataTransfer.files.length !== 1) { setUploadError("Перетащите один файл."); return; } void upload(event.dataTransfer.files[0]); }}
    ><Upload size={15} />{uploading ? "Проверка файла…" : "Заменить файл"}</button>{dirty ? <button className="primary-button small" type="button" disabled={uploadDisabled} onClick={onSave}><Save size={15} />Сохранить правки</button> : <span><Check size={14} />Правки сохранены</span>}{uploadError && <p className="field-error iw-upload-error" role="alert">{uploadError}</p>}</footer>}
    <input ref={input} hidden type="file" accept=".md,.pdf,.docx,.xlsx" disabled={uploadDisabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
  </InstructionPanel>;
}
