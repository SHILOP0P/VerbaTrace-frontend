import { createPortal } from "react-dom";
import { cssClass } from "../../shared/lib/css-styles";
import type { ResizeAlignmentGuide } from "./layout";

/** Viewport overlay: grid reflow and card overflow cannot clip the target line. */
export function WidgetAlignmentGuides({
  guides,
}: {
  guides: ResizeAlignmentGuide[];
}) {
  if (!guides.length) return null;
  const header = document.querySelector(".app-header")?.getBoundingClientRect();
  const nav = document
    .querySelector(".mobile-bottom-nav")
    ?.getBoundingClientRect();
  const top = header ? header.bottom + 8 : 8;
  const bottom = nav && nav.height > 0 ? nav.top - 8 : window.innerHeight - 8;
  return createPortal(
    <div className="overview-alignment-guides vt-portal" aria-hidden="true">
      {guides.map((guide) => {
        const vertical = guide.axis === "x";
        const start = Math.max(vertical ? top : 8, guide.start);
        const end = Math.min(
          vertical ? bottom : window.innerWidth - 8,
          guide.end,
        );
        if (
          end <= start ||
          (vertical
            ? guide.position < 8 || guide.position > window.innerWidth - 8
            : guide.position < top || guide.position > bottom)
        )
          return null;
        return (
          <span
            key={guide.axis}
            data-guide-axis={guide.axis}
            className={`overview-alignment-guide is-${vertical ? "vertical" : "horizontal"} ${cssClass(
              vertical
                ? {
                    left: guide.position - 1,
                    top: start,
                    width: 2,
                    height: end - start,
                  }
                : {
                    left: start,
                    top: guide.position - 1,
                    width: end - start,
                    height: 2,
                  },
            )}`}
          />
        );
      })}
    </div>,
    document.body,
  );
}
