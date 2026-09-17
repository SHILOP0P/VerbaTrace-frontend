import { useEffect, useState } from "react";

/**
 * The company the header switcher points at — the workspace everything else is
 * read in. It is the source of `user_preferences.active_company_uuid`, kept in
 * local storage so a reload does not blink through the wrong scope, and
 * broadcast so pages that show calls, actions or reports can follow it.
 *
 * An empty string means the personal workspace, which is a real answer; `null`
 * means nothing has been chosen on this device yet.
 */
const STORAGE_KEY = "verbatrace.activeWorkspaceCompanyId";
const PERSONAL_VALUE = "__personal__";
const CHANGE_EVENT = "verbatrace:workspace-company";

export function readWorkspaceCompanyId(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === null) return null;
    return value === PERSONAL_VALUE ? "" : value;
  } catch {
    return null;
  }
}

export function storeWorkspaceCompanyId(companyId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, companyId || PERSONAL_VALUE);
  } catch {
    // A private window without storage still gets the event below, so the
    // choice works for this session even when it cannot be remembered.
  }
  window.dispatchEvent(new CustomEvent<string>(CHANGE_EVENT, { detail: companyId }));
}

/**
 * The current workspace, re-rendering the caller when it changes. Pages use it
 * to decide what they show by default; an explicit filter in the URL is the
 * reader's own choice and stays untouched.
 */
export function useWorkspaceCompanyId(): string | null {
  const [companyId, setCompanyId] = useState<string | null>(() => readWorkspaceCompanyId());

  useEffect(() => {
    const onChange = (event: Event) => setCompanyId((event as CustomEvent<string>).detail ?? "");
    // Another tab of the same account counts too.
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setCompanyId(readWorkspaceCompanyId());
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return companyId;
}
