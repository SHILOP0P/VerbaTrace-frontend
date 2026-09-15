import type { AuthResponse, UserResponse } from "../../types";

const refreshLockName = "verbatrace.auth.refresh";
let inTabRefresh: Promise<AuthResponse> | null = null;

type RefreshActions = {
  refresh: () => Promise<AuthResponse>;
  probe: () => Promise<UserResponse | null>;
  isConflict: (error: unknown) => boolean;
};

async function runWithBrowserLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return task();
  return navigator.locks.request(refreshLockName, task);
}

export function coordinateRefresh(actions: RefreshActions): Promise<AuthResponse> {
  if (!inTabRefresh) {
    inTabRefresh = runWithBrowserLock(async () => {
      const currentUser = await actions.probe();
      if (currentUser) return { user: currentUser };

      try {
        return await actions.refresh();
      } catch (error) {
        if (!actions.isConflict(error)) throw error;
        const user = await actions.probe();
        if (!user) throw error;
        return { user };
      }
    }).finally(() => {
      inTabRefresh = null;
    });
  }

  return inTabRefresh;
}
