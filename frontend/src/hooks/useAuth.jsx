import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, restoreSession } from "../services/api.js";
import { formatDate, formatDateTime, formatTime } from "../utils/datetime.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [network, setNetwork] = useState(null);
  const [facilityId, setFacilityId] = useState(() => localStorage.getItem("mc_facility") || "");
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const data = await restoreSession();
      setUser(data.user);
      setFacilities(data.facilities || []);
      setDoctorProfile(data.doctorProfile);
      setNetwork(data.network || null);
      const ids = (data.facilities || []).map((f) => String(f._id));
      setFacilityId((current) => {
        if (ids.length && current && ids.includes(String(current))) return current;
        return ids[0] || "";
      });
    } catch {
      setUser(null);
      setFacilities([]);
      setDoctorProfile(null);
      setNetwork(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (facilityId) localStorage.setItem("mc_facility", facilityId);
    else localStorage.removeItem("mc_facility");
  }, [facilityId]);

  const value = useMemo(
    () => ({
      user,
      facilities,
      doctorProfile,
      network,
      facilityId,
      setFacilityId,
      loading,
      setSession: async (payload) => {
        setUser(payload.user);
        setLoading(false);
        await loadMe();
      },
      applyUser: (next) => setUser((prev) => ({ ...prev, ...next })),
      applyFacility: (facility) => {
        if (!facility?._id) return;
        setFacilities((prev) => {
          const id = String(facility._id);
          const next = prev.map((f) => (String(f._id) === id ? { ...f, ...facility } : f));
          return next.some((f) => String(f._id) === id) ? next : [...prev, facility];
        });
      },
      applyNetwork: (next) => {
        if (!next) return;
        setNetwork((prev) => ({ ...(prev || {}), ...next }));
      },
      clearSession: () => {
        setUser(null);
        setFacilities([]);
        setDoctorProfile(null);
        setNetwork(null);
        setFacilityId("");
        localStorage.removeItem("mc_facility");
      },
      refresh: loadMe,
      formatDate: (v) => formatDate(v, user?.dateFormat),
      formatTime: (v) => formatTime(v, user?.timeFormat),
      formatDateTime: (v) => formatDateTime(v, user?.dateFormat, user?.timeFormat),
      logout: async () => {
        try {
          await api("/api/auth/logout", { method: "POST" });
        } catch {
          /* session already gone */
        }
        setUser(null);
        setFacilities([]);
        setDoctorProfile(null);
        setNetwork(null);
        setFacilityId("");
        localStorage.removeItem("mc_facility");
      },
    }),
    [user, facilities, doctorProfile, network, facilityId, loading, loadMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
