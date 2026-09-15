import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../api";
import type { SessionState, UserResponse } from "../../types";

type AuthContextValue = {
  ready: boolean;
  session: SessionState | null;
  setAuthenticatedUser: (user: UserResponse) => void;
  clearSession: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.refreshSession()
      .then(({ user }) => { if (!cancelled) setSession({ user }); })
      .catch(() => { if (!cancelled) setSession(null); })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const clearExpiredSession = () => setSession(null);
    window.addEventListener("verbatrace:session-expired", clearExpiredSession);
    return () => {
      window.removeEventListener("verbatrace:session-expired", clearExpiredSession);
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    session,
    setAuthenticatedUser: (user) => setSession({ user }),
    clearSession: () => setSession(null)
  }), [ready, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
