// export const API_BASE_URL = (
//   import.meta.env.VITE_API_BASE_URL ||
//   import.meta.env.API_BASE_URL ||
//   ""
// ).replace(/\/+$/, "");

// const API = API_BASE_URL;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const API = API_BASE_URL;

export const DATA_CHANGED = "mc:data-changed";
const DATA_CHANNEL = "mc-data";
let dataChannel;

function getDataChannel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!dataChannel) {
    try {
      dataChannel = new BroadcastChannel(DATA_CHANNEL);
    } catch {
      dataChannel = null;
    }
  }
  return dataChannel;
}

function emitDataChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DATA_CHANGED));
  getDataChannel()?.postMessage("changed");
}

export function subscribeDataChanged(handler) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DATA_CHANGED, handler);
  const bc = getDataChannel();
  if (bc) bc.addEventListener("message", handler);
  return () => {
    window.removeEventListener(DATA_CHANGED, handler);
    if (bc) bc.removeEventListener("message", handler);
  };
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshLock = null;

const SKIP_REFRESH = new Set([
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/otp/request",
  "/api/auth/otp/login",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/logout",
]);

function shouldRefresh(path) {
  return !SKIP_REFRESH.has(path);
}

export async function tryRefresh() {
  if (!refreshLock) {
    refreshLock = fetch(`${API}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    }).finally(() => {
      refreshLock = null;
    });
  }
  return refreshLock;
}

export async function api(path, { method = "GET", body, facilityId, headers, _retry } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(facilityId ? { "x-facility-id": facilityId } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !_retry && shouldRefresh(path)) {
    const refreshed = await tryRefresh();
    if (refreshed?.ok) {
      return api(path, { method, body, facilityId, headers, _retry: true });
    }
  }
  if (!res.ok) {
    throw new ApiError(data.error || "Request failed", res.status, data.code);
  }
  if (["POST", "PATCH", "PUT", "DELETE"].includes(String(method).toUpperCase()) && !path.startsWith("/api/auth/")) {
    emitDataChanged();
  }
  return data;
}

export async function restoreSession() {
  return await api("/api/auth/me");
}

export async function downloadBinary(path, { facilityId, filename = "download.pdf" } = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: facilityId ? { "x-facility-id": facilityId } : {},
  });
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed?.ok) {
      return downloadBinary(path, { facilityId, filename });
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || "Download failed", res.status, data.code);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
