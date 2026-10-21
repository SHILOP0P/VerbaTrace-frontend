import type { OverviewLayout, OverviewWidget } from "./layout";

export type LayoutState = {
  value?: OverviewLayout;
  saving: boolean;
  recovering: boolean;
  error: string;
  conflict: boolean;
};
type Transport = {
  load(): Promise<OverviewLayout>;
  save(value: OverviewLayout): Promise<OverviewLayout>;
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Не удалось сохранить раскладку";
const isConflict = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  error.status === 409;

function sameWidgets(a: OverviewWidget[], b: OverviewWidget[]) {
  const stable = (value: unknown) =>
    JSON.stringify(value, (_key, item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, item[key]]),
          )
        : item,
    );
  return stable(a) === stable(b);
}

/** Keep the local draft editable after a failed save; never overwrite a different remote layout silently. */
export function createLayoutPersistence(
  transport: Transport,
  notify: (state: LayoutState) => void,
) {
  let state: LayoutState = {
    saving: false,
    recovering: false,
    error: "",
    conflict: false,
  };
  let confirmed: OverviewLayout | undefined;
  let pending: OverviewWidget[] | undefined;
  let running = false,
    paused = false,
    stopped = false;
  const emit = (patch: Partial<LayoutState>) => {
    state = { ...state, ...patch };
    if (!stopped) notify(state);
  };
  const dirty = () => running || paused || !!pending;

  async function save(base: OverviewLayout, widgets: OverviewWidget[]) {
    try {
      return await transport.save({ version: base.version, widgets });
    } catch (error) {
      if (!isConflict(error)) throw error;
      const latest = await transport.load();
      // A second tab can advance the version without changing any visible settings.
      // Retrying that case is safe; a genuinely different layout needs an explicit choice.
      if (!sameWidgets(base.widgets, latest.widgets)) throw error;
      return transport.save({ version: latest.version, widgets });
    }
  }
  async function pump() {
    if (running || paused || !confirmed || stopped) return;
    running = true;
    emit({ saving: true });
    try {
      while (pending && !stopped) {
        const widgets = pending;
        pending = undefined;
        confirmed = await save(confirmed, widgets);
        emit({
          value: {
            version: confirmed.version,
            widgets: state.value?.widgets ?? confirmed.widgets,
          },
        });
      }
    } catch (error) {
      pending = state.value?.widgets;
      paused = true;
      const conflict = isConflict(error);
      emit({
        conflict,
        error: conflict
          ? "Раскладка изменена в другом окне. Ваши изменения остаются на экране. Выберите, какую версию сохранить."
          : `${message(error)}. Ваши изменения остаются на экране; сохранение можно повторить.`,
      });
    } finally {
      running = false;
      emit({ saving: false });
    }
  }
  function change(widgets: OverviewWidget[]) {
    if (!confirmed || stopped) return;
    emit({ value: { version: confirmed.version, widgets } });
    pending = widgets;
    void pump();
  }
  async function reload() {
    if (running || state.recovering) return;
    emit({ recovering: true });
    try {
      const next = await transport.load();
      confirmed = next;
      pending = undefined;
      paused = false;
      emit({ value: next, error: "", conflict: false });
    } catch (error) {
      emit({ error: message(error) });
    } finally {
      emit({ recovering: false });
    }
  }
  async function retry(replaceRemote = false) {
    if (
      running ||
      state.recovering ||
      !state.value ||
      (state.conflict && !replaceRemote)
    )
      return;
    if (replaceRemote) {
      emit({ recovering: true });
      try {
        confirmed = await transport.load();
      } catch (error) {
        emit({ error: message(error), recovering: false });
        return;
      }
      emit({ recovering: false });
    }
    paused = false;
    pending = state.value.widgets;
    emit({ error: "", conflict: false });
    await pump();
  }
  async function refresh() {
    if (dirty() || state.recovering || !confirmed) return;
    const version = confirmed.version;
    try {
      const latest = await transport.load();
      if (
        stopped ||
        dirty() ||
        confirmed.version !== version ||
        latest.version < version
      )
        return;
      confirmed = latest;
      emit({ value: latest });
    } catch {
      /* A background refresh must not interrupt a usable editor. */
    }
  }
  return {
    change,
    reload,
    retry,
    refresh,
    dirty,
    dispose: () => {
      stopped = true;
    },
  };
}
