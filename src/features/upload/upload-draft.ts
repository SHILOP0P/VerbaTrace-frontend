/** Local upload drafts contain files, never credentials. They expire after a day
 * and are removed on sign-out. A quota failure keeps navigation recovery in RAM. */
export type UploadDraft = {
  uploadMode: "single" | "multiple";
  title: string;
  media: File | null;
  batchItems: { id: string; file: File; title: string; status: "pending" | "uploading" | "success" | "failed"; error?: string }[];
  scope: "personal" | "company" | "department";
  companyId: string;
  departmentId: string;
  folderId: string;
  criterionKeys: string[];
  speakerHints: { id: string; name: string; username?: string; role: "self" | "other"; note: string }[];
  diarizationRoles: { id: string; name: string; description: string }[];
  roleName: string;
  roleDescription: string;
};
const drafts = new Map<string, UploadDraft>();
const revoked = new Set<string>();
let operations = Promise.resolve();
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("verbatrace-upload-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
function serial<T>(action: () => Promise<T>): Promise<T> {
  const next = operations.then(action);
  operations = next.then(() => undefined, () => undefined);
  return next;
}
export async function loadUploadDraft(user: string): Promise<UploadDraft | undefined> {
  revoked.delete(user);
  if (drafts.has(user)) return drafts.get(user);
  return serial(async () => {
    const db = await database();
    try {
      const record = await new Promise<{ savedAt: number; draft: UploadDraft } | undefined>((resolve, reject) => {
        const request = db.transaction("drafts").objectStore("drafts").get(user);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (!record) return undefined;
      if (Date.now() - record.savedAt > 86400000) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("drafts", "readwrite");
          tx.objectStore("drafts").delete(user);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return undefined;
      }
      const draft = { ...record.draft, batchItems: record.draft.batchItems.filter(item => item.status !== "success").map(item => item.status === "uploading" ? ({ ...item, status: "failed" as const, error: "Отправка была прервана. Перед повтором проверьте, появился ли звонок в списке." }) : item) };
      drafts.set(user, draft);
      return draft;
    } finally { db.close(); }
  });
}
export function rememberUploadDraft(user: string, draft: UploadDraft) {
  if (!revoked.has(user)) drafts.set(user, draft);
}
export function saveUploadDraft(user: string, draft: UploadDraft): Promise<void> {
  if (revoked.has(user)) return Promise.resolve();
  rememberUploadDraft(user, draft);
  return serial(async () => {
    if (revoked.has(user)) return;
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("drafts", "readwrite");
        tx.objectStore("drafts").put({ savedAt: Date.now(), draft }, user);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}
export function clearUploadDraft(user: string): Promise<void> {
  drafts.delete(user);
  revoked.add(user);
  return serial(async () => {
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("drafts", "readwrite");
        tx.objectStore("drafts").delete(user);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}
