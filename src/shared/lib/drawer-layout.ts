import { useEffect, useState } from "react";

/**
 * drawerLayoutQuery is the one width at which the call list stops fitting
 * beside the call itself. Below it the list becomes an overlay opened by a
 * button; above it, it is a column of the layout.
 *
 * The stylesheets use the same number (`mobile.css`, `auth-app.css`). It is
 * kept here so the markup and the styles cannot drift apart: when they did,
 * there was a band of widths where the list had already left the layout but no
 * button had appeared, and the page showed an empty strip instead.
 */
export const drawerLayoutQuery = "(max-width: 1320px)";

export function useDrawerLayout() {
  const [isDrawerLayout, setIsDrawerLayout] = useState(
    () => typeof window !== "undefined" && window.matchMedia(drawerLayoutQuery).matches
  );

  useEffect(() => {
    const query = window.matchMedia(drawerLayoutQuery);
    const update = () => setIsDrawerLayout(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isDrawerLayout;
}
