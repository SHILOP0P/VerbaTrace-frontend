import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { defaultWidgets, type OverviewWidget } from "./layout";
import {
  createLayoutPersistence,
  type LayoutState,
} from "./layout-persistence";

export function useOverviewLayout(workspace: string) {
  const [state, setState] = useState<LayoutState>({
    saving: false,
    recovering: false,
    error: "",
    conflict: false,
  });
  const controller = useRef<
    ReturnType<typeof createLayoutPersistence> | undefined
  >(undefined);
  useEffect(() => {
    const store = createLayoutPersistence(
      {
        load: async () => {
          const value = await api.getOverviewLayout(workspace);
          return {
            ...value,
            widgets: value.version === 0 ? defaultWidgets() : value.widgets,
          };
        },
        save: (value) => api.saveOverviewLayout(workspace, value),
      },
      setState,
    );
    controller.current = store;
    void store.reload();
    const refresh = () => {
      if (document.visibilityState === "visible") void store.refresh();
    };
    const warn = (event: BeforeUnloadEvent) => {
      if (store.dirty()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("beforeunload", warn);
    return () => {
      store.dispose();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("beforeunload", warn);
    };
  }, [workspace]);
  return {
    ...state,
    blocked: state.recovering,
    change: (widgets: OverviewWidget[]) => controller.current?.change(widgets),
    reload: () => controller.current?.reload(),
    retry: (replaceRemote = false) => controller.current?.retry(replaceRemote),
  };
}
