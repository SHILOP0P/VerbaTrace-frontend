/**
 * The demo screen runs on the workspace's origin, so the real localStorage
 * would receive the fixture company as the visitor's active workspace and the
 * collapsed-list flags of the demo. An in-memory Storage keeps every write to
 * the demo document itself.
 */
export function installMemoryStorage() {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    }
  };

  try {
    Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  } catch {
    // The real storage stays: the demo still works, it only remembers the
    // fixture workspace on this device.
  }
}
