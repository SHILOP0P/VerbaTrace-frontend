import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";

export function useAssistantAccess(companies: { id: string; name: string }[]) {
  const [allowed, setAllowed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
	const generation = useRef(0);
  const ids = companies.map(company => company.id).sort().join(",");
  const refresh = useCallback(async () => {
	const current = ++generation.current;
    const scopes = ["", ...ids.split(",").filter(Boolean)];
    const results = await Promise.allSettled(scopes.map(id => api.assistantCapabilities(id)));
	if (current !== generation.current) return;
    setAllowed(scopes.filter((_, index) => { const result = results[index]; return result.status === "fulfilled" && result.value.chat_enabled && result.value.schema_version === 2; }));
    setLoaded(true);
  }, [ids]);
  useEffect(() => {
	setLoaded(false);
    void refresh();
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    const timer = window.setInterval(focus, 30000);
    return () => { generation.current++; window.clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [refresh]);
  return { allowed, loaded, refresh };
}
