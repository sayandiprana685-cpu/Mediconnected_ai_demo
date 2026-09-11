import { useCallback, useEffect, useRef, useState } from "react";
import { api, subscribeDataChanged } from "../services/api.js";
import { useAuth } from "../hooks/useAuth.jsx";

export function useApi(path, deps = [], options = {}) {
  const { facilityId, loading: authLoading, user, clearSession } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollMs = options.pollMs;
  const dataRef = useRef(null);
  dataRef.current = data;

  const reload = useCallback(
    async (opts = {}) => {
      if (!path || authLoading || !user) {
        if (!authLoading && !user) {
          setLoading(false);
        }
        return;
      }
      if (!opts.silent) setLoading(true);
      try {
        const res = await api(path, { facilityId });
        setData(res);
        setError("");
        setErrorStatus(null);
      } catch (e) {
        if (e.status === 401) clearSession();
        if (!opts.silent || !dataRef.current) {
          setError(e.message);
          setErrorStatus(e.status || 500);
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [path, facilityId, authLoading, user, clearSession]
  );

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, facilityId, reload, authLoading, user, ...deps]);

  useEffect(() => {
    if (!pollMs) return undefined;
    const id = setInterval(() => reload({ silent: true }), pollMs);
    return () => clearInterval(id);
  }, [pollMs, reload]);

  useEffect(() => {
    const onChange = () => reload({ silent: true });
    const unsub = subscribeDataChanged(onChange);
    const onVisible = () => {
      if (document.visibilityState === "visible") onChange();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  return { data, error, errorStatus, loading, reload, facilityId };
}

export function statusLabel(s) {
  return String(s || "").replaceAll("_", " ");
}
