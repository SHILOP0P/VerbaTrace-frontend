import { cssStyle } from "../../shared/lib/css-styles";
import DOMPurify from "dompurify";
import { Download, ExternalLink, FileText, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkChangedLines, remarkObsidianHighlight } from "./markdownPlugins";
import { TransientAlert } from "../../shared/ui/TransientAlert";

type Sheet = { name: string; rows: Array<Array<string | number | boolean | null>> };
let pdfModulePromise: Promise<typeof import("pdfjs-dist")> | undefined;
function loadPDFJS() { pdfModulePromise ??= import("pdfjs-dist").then((module) => { module.GlobalWorkerOptions.workerSrc = pdfWorker; return module; }); return pdfModulePromise; }

export async function extractInstructionText(filename: string, blob: Blob) {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "md") return normalizeExtractedText(await blob.text());
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    return normalizeExtractedText((await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() })).value);
  }
  if (extension === "xlsx") {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const lines: string[] = [];
    workbook.eachSheet((worksheet) => {
      lines.push(`[${worksheet.name}]`);
      worksheet.eachRow({ includeEmpty: true }, (row) => lines.push(Array.from({ length: Math.max(worksheet.columnCount, row.cellCount) }, (_, index) => row.getCell(index + 1).text).join("\t")));
    });
    return normalizeExtractedText(lines.join("\n"));
  }
  if (extension === "pdf") {
    const task = (await loadPDFJS()).getDocument({ data: await blob.arrayBuffer() });
    try {
      const document = await task.promise;
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const content = await (await document.getPage(pageNumber)).getTextContent();
        pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
      }
      return normalizeExtractedText(pages.join("\n"));
    } finally { await task.destroy(); }
  }
  return "";
}

function normalizeExtractedText(value: string) { return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[ \t]+/g, " ").trim(); }

function PDFPage({ document, pageNumber, scale }: { document: PDFDocumentProxy; pageNumber: number; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    void document.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
      cssStyle(canvas).width = `${Math.floor(viewport.width)}px`; cssStyle(canvas).height = `${Math.floor(viewport.height)}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      renderTask = page.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      return renderTask.promise;
    }).catch((reason) => { if (!cancelled && reason?.name !== "RenderingCancelledException") console.error(reason); });
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [document, pageNumber, scale]);
  return <div className="instruction-pdf-page"><canvas ref={canvasRef}/><span>{pageNumber}</span></div>;
}

function PDFViewer({ blob, filename }: { blob: Blob; filename: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [scale, setScale] = useState(1.15);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  const openInNewTab = () => {
    const opened = window.open(url, "_blank");
    if (!opened) {
      setActionError("Браузер заблокировал новую вкладку. Разрешите всплывающие окна и повторите попытку.");
      return;
    }
    setActionError("");
    opened.opener = null;
  };
  const download = () => {
    const link = window.document.createElement("a");
    link.href = url;
    link.download = filename;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
  };
  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    void blob.arrayBuffer().then((data) => {
      if (cancelled) return;
      return loadPDFJS().then((module) => { if (cancelled) return; task = module.getDocument({ data }); return task.promise; });
    }).then((loaded) => { if (!cancelled && loaded) setDocument(loaded); }).catch(() => { if (!cancelled) setError("Не удалось открыть PDF."); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  if (error) return <TransientAlert message={error} />;
  return <>{actionError ? <TransientAlert message={actionError} /> : null}<section className="instruction-pdf-document"><header><div><FileText size={18}/><span><strong>{filename}</strong><small>{document ? `${document.numPages} стр.` : "Открываю документ…"}</small></span></div><div className="instruction-pdf-actions"><button type="button" aria-label="Уменьшить масштаб" onClick={() => setScale((value) => Math.max(.65, value - .15))}><Minus size={17}/></button><output>{Math.round(scale * 100)}%</output><button type="button" aria-label="Увеличить масштаб" onClick={() => setScale((value) => Math.min(2, value + .15))}><Plus size={17}/></button><button type="button" aria-label="Открыть PDF в новой вкладке" onClick={openInNewTab}><ExternalLink size={17}/></button><button type="button" aria-label="Скачать PDF" onClick={download}><Download size={17}/></button></div></header><div className="instruction-pdf-pages" aria-busy={!document}>{document ? Array.from({ length: document.numPages }, (_, index) => <PDFPage key={index + 1} document={document} pageNumber={index + 1} scale={scale}/>) : <div className="instruction-document-loading" role="status">Подготавливаю страницы…</div>}</div></section></>;
}

export function InstructionDocumentViewer({ filename, blob, markdown, changedLines }: { filename: string; blob?: Blob; markdown?: string; changedLines?: ReadonlyMap<number, "added" | "removed"> }) {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "md";
  const [html, setHtml] = useState(""); const [sheets, setSheets] = useState<Sheet[]>([]); const [sheetIndex, setSheetIndex] = useState(0); const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false; setHtml(""); setSheets([]); setSheetIndex(0); setError("");
    if (!blob) return;
    if (extension === "docx") blob.arrayBuffer().then(async (arrayBuffer) => { const mammoth = await import("mammoth"); const result = await mammoth.convertToHtml({ arrayBuffer }); if (!cancelled) setHtml(DOMPurify.sanitize(result.value)); }).catch(() => { if (!cancelled) setError("Не удалось отобразить DOCX."); });
    if (extension === "xlsx") blob.arrayBuffer().then(async (arrayBuffer) => { const ExcelJS = await import("exceljs"); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(arrayBuffer); const loaded: Sheet[] = []; workbook.eachSheet((worksheet) => { const rows: Sheet["rows"] = []; worksheet.eachRow({ includeEmpty: true }, (row) => { const values: Sheet["rows"][number] = []; for (let column = 1; column <= Math.max(worksheet.columnCount, row.cellCount); column += 1) values.push(row.getCell(column).text); rows.push(values); }); loaded.push({ name: worksheet.name, rows }); }); if (!cancelled) setSheets(loaded); }).catch(() => { if (!cancelled) setError("Не удалось отобразить таблицу."); });
    return () => { cancelled = true; };
  }, [blob, extension]);
  if (error) return <TransientAlert message={error} />;
  if (extension === "pdf" && blob) return <PDFViewer blob={blob} filename={filename}/>;
  if (extension === "docx") return html ? <div className="instruction-article instruction-docx" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="instruction-document-loading" role="status">Открываю документ…</div>;
  if (extension === "xlsx") { const active = sheets[sheetIndex]; return active ? <div className="instruction-workbook"><div className="instruction-sheet-tabs" role="tablist">{sheets.map((sheet, index) => <button type="button" role="tab" aria-selected={index === sheetIndex} className={index === sheetIndex ? "active" : ""} key={sheet.name} onClick={() => setSheetIndex(index)}>{sheet.name}</button>)}</div><div className="instruction-sheet"><table><tbody>{active.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex}>{String(cell ?? "")}</th> : <td key={cellIndex}>{String(cell ?? "")}</td>)}</tr>)}</tbody></table></div></div> : <div className="instruction-document-loading" role="status">Открываю таблицу…</div>; }
  return <article className="instruction-article instruction-markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkObsidianHighlight, ...(changedLines?.size ? [remarkChangedLines(changedLines)] : [])]}>{markdown ?? ""}</ReactMarkdown></article>;
}
