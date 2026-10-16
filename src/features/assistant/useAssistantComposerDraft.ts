import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api";
import type { AssistantDraft, AssistantMode } from "../../types";

export type ComposerDraft = { text: string; context: NonNullable<AssistantDraft["context"]> };
type Entry = { companyId: string; chatId?: string; data: ComposerDraft; version: number; revision: number; loaded: boolean; dirty: boolean; blocked: boolean; saving?: Promise<void> };
export type DraftStore = Map<string, Entry>;
const draftKey = (company: string, chat?: string) => `${company || "personal"}/${chat || "new"}`;
const empty = (mode: AssistantMode = "search"): ComposerDraft => ({ text: "", context: { mode, creation_key:crypto.randomUUID(), items: [], period: null } });
function stable(value:unknown):unknown { if(Array.isArray(value)) return value.map(stable); if(value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])); return value; }

export function useAssistantComposerDraft(companyId: string, chatId: string | undefined, defaultMode: AssistantMode, store: DraftStore, onError: (error: unknown) => void) {
  const key = draftKey(companyId, chatId);
  const currentKey = useRef(key); currentKey.current = key;
  const [loadedKey, setLoadedKey] = useState("");
  const [value, setValue] = useState<ComposerDraft>(() => empty(defaultMode));
  const errors = useRef(onError); errors.current = onError;
  const entryFor = useCallback((id?: string) => {
    const idKey = draftKey(companyId, id);
    let entry = store.get(idKey);
    if (!entry) { entry = { companyId, chatId: id, data: empty(defaultMode), version: 0, revision: 0, loaded: false, dirty: false, blocked: false }; store.set(idKey, entry); }
    return entry;
  }, [companyId, defaultMode, store]);
  const flush = useCallback((entry: Entry): Promise<void> => {
    if (entry.saving) return entry.saving;
    if (!entry.loaded || !entry.dirty || entry.blocked) return Promise.resolve();
    entry.saving = (async () => {
      try {
        while (entry.dirty && !entry.blocked) {
          const revision = entry.revision, snapshot = entry.data;
          let saved:AssistantDraft;
          try { saved = await api.saveAssistantDraft({ company_uuid: entry.companyId, chat_uuid: entry.chatId, text: snapshot.text, context: snapshot.context, lock_version: entry.version }); }
          catch(error) {
            if (!(error instanceof ApiError) || error.status !== 409) throw error;
            const remote = await api.getAssistantDraft(entry.companyId,entry.chatId);
            if (remote.text !== snapshot.text || JSON.stringify(stable(remote.context)) !== JSON.stringify(stable(snapshot.context))) throw error;
            saved = remote;
          }
          entry.version = saved.lock_version;
          if (revision === entry.revision) entry.dirty = false;
        }
      } catch (error) { entry.blocked = error instanceof ApiError && [401,403,409].includes(error.status); errors.current(error); }
      finally { entry.saving = undefined; }
    })();
    return entry.saving;
  }, []);
  useEffect(() => {
    let alive = true;
    const entry = entryFor(chatId);
    if (entry.loaded) { setValue(entry.data); setLoadedKey(key); return; }
    api.getAssistantDraft(companyId, chatId).then(saved => {
      if (!alive || currentKey.current !== key) return;
      const items = saved.context?.items ?? [];
      entry.data = { text: saved.text, context: { ...saved.context, creation_key:saved.context?.creation_key ?? entry.data.context.creation_key, items: items.filter(item => item.kind === "call" || item.kind === "folder"), mode: saved.context?.mode ?? defaultMode } };
      entry.version = saved.lock_version; entry.loaded = true;
      setValue(entry.data); setLoadedKey(key);
    }).catch(error => { if (alive) { errors.current(error); } });
    return () => { alive = false; };
  }, [key, companyId, chatId, entryFor, defaultMode]);
  useEffect(() => {
    if (loadedKey !== key) return;
    const entry = entryFor(chatId);
    const timer = window.setTimeout(() => void flush(entry), 600);
    return () => window.clearTimeout(timer);
  }, [key, loadedKey, value, chatId, entryFor, flush]);
  useEffect(() => {
    const entry = entryFor(chatId);
    const retry = () => { void flush(entry); };
    window.addEventListener("online",retry);window.addEventListener("focus",retry);
    return () => { window.removeEventListener("online",retry);window.removeEventListener("focus",retry);void flush(entry); };
  }, [key, chatId, entryFor, flush]);
  const replaceFor = useCallback((id: string | undefined, data: ComposerDraft) => {
    const entry = entryFor(id);
    entry.data = data; entry.revision++; entry.loaded = true; entry.dirty = true;
    if (currentKey.current === draftKey(companyId, id)) { setValue(data); setLoadedKey(currentKey.current); }
    void flush(entry);
  }, [companyId, entryFor, flush]);
  const update = useCallback((transform: (previous: ComposerDraft) => ComposerDraft) => {
    const entry = entryFor(chatId);
    if (!entry.loaded) return;
    const data = transform(entry.data);
    entry.data = data; entry.revision++; entry.dirty = true;
    setValue(data);
  }, [chatId, entryFor]);
  return { data: loadedKey === key ? value : empty(defaultMode), loaded: loadedKey === key, update, replaceFor,
    clearNew: () => replaceFor(undefined, empty()), flush: () => flush(entryFor(chatId)) };
}
