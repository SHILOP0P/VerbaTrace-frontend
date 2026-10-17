import { SafeMarkdown } from "../../shared/ui/SafeMarkdown";
import remarkGfm from "remark-gfm";
import { remarkChangedLines, remarkObsidianHighlight } from "./markdownPlugins";

// Original Office/PDF bytes are deliberately never parsed in the browser.
export function InstructionDocumentViewer({ markdown, changedLines }: { filename: string; blob?: Blob; markdown?: string; changedLines?: ReadonlyMap<number, "added" | "removed"> }) {
  if (markdown === undefined || markdown === "") return <div className="instruction-document-loading" role="status">Безопасное представление документа подготавливается…</div>;
  if (markdown.length > 1_000_000) return <p role="status">Документ слишком велик для предпросмотра. Проверенный оригинал можно скачать отдельно.</p>;
  return <article className="instruction-article instruction-markdown"><SafeMarkdown remarkPlugins={[remarkGfm, remarkObsidianHighlight, ...(changedLines?.size ? [remarkChangedLines(changedLines)] : [])]}>{markdown}</SafeMarkdown></article>;
}