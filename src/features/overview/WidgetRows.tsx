import { Children, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { widgetMaxHeight, type OverviewWidget } from "./layout";
import { widgetRowCapacity } from "./widget-presentation";
import { cssClass } from "../../shared/lib/css-styles";

/** Lists use pages rather than an internal scrolling surface in a small frame. */
export function WidgetRows({ widget, className, children }: {
  widget: OverviewWidget; className: string; children: ReactNode;
}) {
  const [requestedPage, setPage] = useState(0);
  const items = Children.toArray(children);
  const height = widgetMaxHeight(widget);
  const { capacity, rowHeight } = widgetRowCapacity(height, className === "overview-bars", items.length, className === "overview-listening");
  const pages = Math.max(1, Math.ceil(items.length / capacity));
  const page = Math.min(requestedPage, pages - 1);
  return <div className={`overview-paged ${cssClass({ "--ow-row-height": `${rowHeight}px` })}`}>
    <div className={`ow-page-content ${className}`}>{items.slice(page * capacity, (page + 1) * capacity)}</div>
    {pages > 1 && <nav className="ow-row-pages" aria-label={`Строки: ${widget.kind}`}>
      <button type="button" className="icon-button" aria-label="Предыдущие строки" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={14}/></button>
      <span>{page * capacity + 1}–{Math.min(items.length, (page + 1) * capacity)} из {items.length}</span>
      <button type="button" className="icon-button" aria-label="Следующие строки" disabled={page === pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={14}/></button>
    </nav>}
  </div>;
}
