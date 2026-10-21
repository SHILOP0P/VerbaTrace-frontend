import { SafeMarkdown } from "../../shared/ui/SafeMarkdown";
import remarkGfm from "remark-gfm";
import { remarkChangedLines, remarkObsidianHighlight } from "./markdownPlugins";

// Original Office/PDF bytes are deliberately never parsed in the browser.
export function InstructionDocumentViewer({ filename, markdown, changedLines }: { filename: string; blob?: Blob; markdown?: string; changedLines?: ReadonlyMap<number, "added" | "removed"> }) {
  if (markdown === undefined) return <div className="instruction-document-loading" role="status">Безопасное представление документа подготавливается…</div>;
  if (markdown.trim() === "") return <p className="instruction-document-loading" role="status">В документе не найден текст для предпросмотра.{filename.toLowerCase().endsWith(".pdf") && " Для сканированных страниц требуется распознавание текста (OCR)."}</p>;
  if (markdown.length > 1_000_000) return <p role="status">Документ слишком велик для предпросмотра. Проверенный оригинал можно скачать отдельно.</p>;
  if (filename.toLowerCase().endsWith(".pdf")) return <article className="instruction-article instruction-pdf-text"><pre>{markdown}</pre></article>;
  return <article className="instruction-article instruction-markdown"><SafeMarkdown scrollTables remarkPlugins={[remarkGfm, remarkObsidianHighlight, ...(changedLines?.size ? [remarkChangedLines(changedLines)] : [])]}>{markdown}</SafeMarkdown></article>;
}
