import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../api";
import type { SessionState, UserResponse } from "../../types";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";

type AuthContextValue = {
  ready: boolean;
  session: SessionState | null;
  setAuthenticatedUser: (user: UserResponse) => void;
  clearSession: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// The access token lives an hour, so the session is refreshed well before it
// runs out. A tab left open overnight refreshes on the way back instead of
// greeting the person with a login screen.
const backgroundRefreshInterval = 45 * 60 * 1000;
const refreshOnFocusAfter = 5 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionEndedOpen, setSessionEndedOpen] = useState(false);
  const lastRefreshRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.refreshSession();
      lastRefreshRef.current = Date.now();
      setSession({ user });
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.refreshSession()
      .then(({ user }) => {
        if (cancelled) return;
        lastRefreshRef.current = Date.now();
        setSession({ user });
      })
      .catch(() => { if (!cancelled) setSession(null); })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session) return;

    const timer = window.setInterval(() => { void refresh(); }, backgroundRefreshInterval);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshRef.current < refreshOnFocusAfter) return;
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh, session]);

  useEffect(() => {
    // A failed request does not end the session by itself: one more refresh is
    // tried, and only its failure logs the person out — with a dialog, not by
    // dropping them on the landing page mid-task.
    const onSessionExpired = () => {
      void (async () => {
        if (await refresh()) return;
        setSessionEndedOpen(true);
      })();
    };
    window.addEventListener("verbatrace:session-expired", onSessionExpired);
    return () => {
      window.removeEventListener("verbatrace:session-expired", onSessionExpired);
    };
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    session,
    setAuthenticatedUser: (user) => {
      lastRefreshRef.current = Date.now();
      setSession({ user });
    },
    clearSession: () => setSession(null)
  }), [ready, session]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={sessionEndedOpen}
        title="Сессия завершена"
        message="Вход по этой сессии больше не действует. Войдите снова, чтобы продолжить работу."
        confirmLabel="Войти снова"
        cancelLabel="Закрыть"
        onCancel={() => setSessionEndedOpen(false)}
        onConfirm={() => {
          setSessionEndedOpen(false);
          setSession(null);
        }}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
